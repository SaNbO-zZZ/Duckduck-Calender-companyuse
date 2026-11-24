const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const postgres = require('postgres');
const { drizzle } = require('drizzle-orm/postgres-js');
const { CalendarController } = require('../dist/server/modules/calendar/calendar.controller');
const { DutyController } = require('../dist/server/modules/duty/duty.controller');
const { DutyAutomationTasksService } = require('../dist/server/modules/duty/duty.automation');
const { LegacyWriteGate } = require('../dist/server/common/legacy-write-gate');

function routes(gate, operations) {
  const request = { userContext: { userId: 'fixture' } };
  const calendar = new CalendarController(operations, operations, gate);
  const duty = new DutyController(operations, gate);
  const cron = new DutyAutomationTasksService(operations, gate);
  return [
    () => calendar.register({}, request), () => calendar.publishAnnouncement({}, request),
    () => calendar.publishEntryNotice(request), () => duty.createExchange({}, request),
    () => duty.getExchange('test', request), () => duty.decideExchange('test', {}, request),
    () => cron.sendDailyDutyReminder(),
  ];
}

test('all legacy HTTP mutations, expiring GET and cron refuse work before any side effect', async () => {
  const called = [];
  const operations = new Proxy({}, { get: () => () => { called.push(true); } });
  const gate = new LegacyWriteGate({ execute: async () => [{ admitted: false }] });
  for (const invoke of routes(gate, operations)) await assert.rejects(invoke, e => e.getStatus() === 503);
  assert.equal(called.length, 0);
});

const tables = ['calendar_submission','calendar_release_announcement','calendar_release_delivery',
  'calendar_release_roster','duty_weekly_rule','duty_avatar_binding','duty_exchange_request',
  'duty_override','duty_notification_delivery'];
const sqlFile = name => fs.readFileSync(path.join(__dirname, '../server/database/cutover', name + '.sql'), 'utf8');
const supportsCluster = process.getuid?.() !== 0 && ['initdb','pg_ctl'].every(binary => spawnSync(binary, ['--version']).status === 0);

test('independent database connections close admission, require drain and seal all nine tables', { skip: !supportsCluster }, async t => {
  const root = fs.mkdtempSync('/tmp/ducky-gate-');
  const data = path.join(root, 'data');
  const options = { stdio: 'pipe' };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('initdb', ['-D', data, '-U', 'gate_fixture', '-A', 'trust','--no-locale'], options);
  execFileSync('pg_ctl', ['-D', data, '-l', path.join(root,'pg.log'), '-o', `-c listen_addresses='' -k ${root} -p 55492`, '-w', 'start'], options);
  const dbConfig = { host: root, port: 55492, user: 'gate_fixture', database: 'postgres', max: 1, onnotice() {} };
  const application = postgres(dbConfig), operator = postgres(dbConfig);
  try {
    for (const table of tables) await operator.unsafe(`CREATE TABLE public.${table}(sample integer)`);
    await operator.unsafe(sqlFile('install'));
    const gate = new LegacyWriteGate(drizzle(application));
    let start, finish;
    const started = new Promise(resolve => { start = resolve; });
    const finishWork = new Promise(resolve => { finish = resolve; });
    const admitted = gate.run('registration', null, async () => {
      start();
      await finishWork;
      await application`INSERT INTO calendar_submission VALUES (1)`;
      return 'done';
    });
    await started;
    await operator.unsafe(sqlFile('drain'));
    assert.equal((await operator`SELECT count(*)::int AS n FROM ducky_legacy_work`)[0].n, 1);
    await assert.rejects(gate.run('late-arrival', null, async () => assert.fail()), e => e.getStatus() === 503);
    await assert.rejects(operator.unsafe(sqlFile('seal')), /Outstanding legacy work/);
    await operator`ROLLBACK`;
    finish();
    assert.equal(await admitted, 'done');
    await operator.unsafe(sqlFile('seal'));
    await operator.unsafe(sqlFile('install'));
    for (const table of tables) {
      for (const command of [`INSERT INTO ${table} VALUES(2)`, `UPDATE ${table} SET sample=3`, `DELETE FROM ${table}`, `TRUNCATE ${table}`]) {
        await assert.rejects(operator.unsafe(command), /Legacy business writes are sealed/);
      }
    }
    assert.deepEqual((await operator`SELECT sample FROM calendar_submission`).map(r => r.sample), [1]);
    await assert.rejects(gate.run('cron', null, async () => assert.fail()), e => e.getStatus() === 503);
    // Re-open only in this isolated fixture to exercise unknown outcomes.
    await operator`UPDATE ducky_legacy_gate SET mode = 'open'`;
    await assert.rejects(gate.run('failed', { requestKey: "employee contact details" }, async () => { throw Error('unknown receipt'); }), /unknown receipt/);
    await gate.run('reported', { version: "v1.2.3" }, async () => 'needs_review', () => false);
    const uncertain = await operator`SELECT reference FROM ducky_legacy_work WHERE state = 'needs_review' ORDER BY operation`;
    assert.deepEqual(uncertain.map(row => row.reference), [null, 'v1.2.3']);
    await operator.unsafe(sqlFile('drain'));
    await assert.rejects(operator.unsafe(sqlFile('seal')), /Outstanding legacy work/);
  } finally {
    await Promise.allSettled([operator.end(), application.end()]);
    execFileSync('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop'], options);
  }
});
