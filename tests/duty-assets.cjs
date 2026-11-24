const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/duty-ducks-v1/manifest.json'), 'utf8'));
const roles = ['mia', 'momo', 'zhangsanbo', 'barra', 'ziyu', 'jiajia', 'billy'];
const actions = ['react', 'walk-left', 'peek', 'jump'];

test('duty asset manifest keeps seven immutable role sources and v2.1 action contract', () => {
  assert.equal(manifest.manifestVersion, 'duty-ducks-v2.1');
  assert.deepEqual(manifest.actionContract, {
    react: 2,
    walkLeft: 3,
    peek: 2,
    jump: 2,
    strategy: 'dedicated-action-sheets-from-approved-idle-frames-with-motion-only-transforms',
  });
  assert.deepEqual(Object.keys(manifest.roles).sort(), roles.slice().sort());
  for (const role of roles) {
    const entry = manifest.roles[role];
    assert.match(entry.conceptSource, /^assets\/duty-ducks-v1\/concepts\/.+\.png$/);
    assert.match(entry.spriteSheet, /\/188\d+\.png$/);
    assert.deepEqual(entry.actionFrameCounts, { react: 2, walkLeft: 3, peek: 2, jump: 2 });
    for (const action of actions) assert.match(entry.actionSheets[action], /\/188\d+\.png$/);
  }
});

test('the runtime manifest resolves approved roles to bundled PNG grids', () => {
  const { dutyAssetManifest, resolveDutyDuckKey, weeklyDutyDuckKeys } = require('../dist/shared/duty-assets');
  assert.deepEqual([...weeklyDutyDuckKeys], ['caishen', 'cockroach', 'racing', 'beer', 'esports', 'lion', 'kunduck']);
  assert.deepEqual(Object.keys(dutyAssetManifest.roles), [...weeklyDutyDuckKeys]);
  for (const legacyKey of roles) assert.ok(resolveDutyDuckKey(legacyKey));
  assert.equal(resolveDutyDuckKey('toString'), undefined);

  for (const key of weeklyDutyDuckKeys) {
    assert.equal(resolveDutyDuckKey(key), key);
    const role = dutyAssetManifest.roles[key];
    const files = [
      [role.assetPath, 256, 256],
      [role.spriteSheet, 1536, 1536],
      ...Object.entries(role.actionSheets).map(([action, url]) => [url, role.actions[action].length * 256, 256]),
    ];
    for (const [url, width, height] of files) {
      assert.ok(url.startsWith(`/assets/duty-ducks-v2/${key}/`));
      const png = fs.readFileSync(path.join(root, 'client/public', url));
      assert.equal(png.toString('ascii', 12, 16), 'IHDR');
      assert.equal(png.readUInt32BE(16), width, url);
      assert.equal(png.readUInt32BE(20), height, url);
    }
  }
});
