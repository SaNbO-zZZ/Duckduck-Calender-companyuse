import { createHash } from 'node:crypto';
import { z } from 'zod';
import { beijingDate, parseBeijingDate } from '../shared/duty-calendar.js';
import type { RegistrationResult } from '../shared/api.interface.js';
import { db, HttpError } from './feishu-auth.js';
import { Feishu, messageUuid, openId, tables } from './feishu-platform.js';
import { directory, input, insert, patch, query } from './business-http.js';

const form = z
  .object({
    requestKey: z.uuid(),
    kind: z.enum(['leave', 'late', 'early']),
    mentorId: openId,
    leaveType: z.enum(['年假', '调休', '出差', '事假', '病假', '今天不想上班', '']),
    start: z.string().max(40),
    end: z.string().max(40),
    arrivalTime: z.string().max(8),
    arrivalDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .strict();
type Form = z.infer<typeof form>;
type Row = {
  id: string;
  applicant: string;
  payload_hash: string;
  submitted_ms: number;
  record_id: string | null;
  record_state: string;
  mentor_state: string;
  hr_state: string;
  base_status_synced: boolean | null;
};
const table = 'calendar_submission';
const time = (ms: number) => new Date(ms + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');

function stamp(value: string) {
  const ms = Date.parse(value + ':00+08:00');
  if (!Number.isFinite(ms) || time(ms).replace(' ', 'T') !== value)
    throw new HttpError(400, '请选择有效的日期和时间。');
  return ms;
}
export function interval(f: Form, now: number) {
  if (f.kind === 'leave') {
    const start = stamp(f.start),
      end = stamp(f.end);
    if (!f.leaveType || end <= start || end - start > 366 * 86400000)
      throw new HttpError(400, '请检查类型及起止时间。');
    return { start, end };
  }
  const day = beijingDate(now);
  if (f.kind === 'early') return { start: now, end: parseBeijingDate(day) + 86400000 };
  const date = f.arrivalDate || day;
  const start = stamp(date + 'T10:00'),
    end = stamp(date + 'T' + f.arrivalTime);
  if (end <= start || end <= now)
    throw new HttpError(400, '预计到达须晚于所选日期 10:00 且晚于当前时刻。');
  return { start, end };
}
function result(row: Row): RegistrationResult {
  const recorded = Boolean(row.record_id && row.record_state === 'created');
  const sent = recorded && row.hr_state === 'sent' && row.mentor_state === 'sent';
  const processing =
    Date.now() - row.submitted_ms < 120000 &&
    (row.record_state === 'creating' ||
      (recorded && [row.mentor_state, row.hr_state].some((s) => ['sending', 'pending'].includes(s))));
  return {
    recorded,
    recordId: row.record_id,
    processing,
    notifications: sent ? 'sent' : processing ? 'sending' : 'pending_review',
    message: (sent
      ? '已登记，已向 Mentor 和人事发送通知。'
      : processing
        ? '正在处理，请稍候。'
        : recorded
          ? '已登记，通知待核对。'
          : '登记结果待核对，请勿重复提交。') +
      (recorded && !processing && row.base_status_synced === false ? ' 多维表格的通知状态待同步。' : ''),
  };
}

async function existing(key: string, actor: string) {
  const rows = await db<Row[]>(
    query(table, { request_key: 'eq.' + key, applicant: 'eq.' + actor, limit: '1' }),
  );
  return rows[0];
}
export async function registrationStatus(key: string | null, actor: string) {
  const row = await existing(input(z.uuid(), key), actor);
  return { result: row ? result(row) : null };
}
async function syncBaseStatus(api: Feishu, target: string, row: Row) {
  const outcome = result(row);
  if (row.base_status_synced !== false || !outcome.recorded || !row.record_id ||
      ![row.mentor_state, row.hr_state].every(s => s === 'sent' || s === 'pending_review')) return outcome;
  try {
    await api.update(target, row.record_id, {
      通知状态: outcome.notifications === 'sent' ? '已发送' : '待核对',
    });
    const [updated] = await patch<Row>(table, { id: 'eq.' + row.id }, { base_status_synced: true });
    if (updated) return result(updated);
  } catch {
    // A retry can safely repair this field without creating a record or sending again.
  }
  return outcome;
}
function replay(api: Feishu, target: string, row: Row | undefined, hash: string) {
  if (!row || row.payload_hash !== hash) throw new HttpError(409, '登记编号冲突。');
  return syncBaseStatus(api, target, row);
}

export async function register(api: Feishu, actor: string, raw: unknown) {
  const f = input(form, raw);
  const target = f.kind === 'leave' ? tables.leave : tables.attendance;
  const hash = createHash('sha256').update(JSON.stringify(f)).digest('hex');
  const prior = await existing(f.requestKey, actor);
  if (prior) return replay(api, target, prior, hash);
  const now = Date.now(),
    { start, end } = interval(f, now);
  const hr = await api.hr(),
    recipients = [...new Set([f.mentorId, hr])];
  const people = await directory([actor, ...recipients]);
  if ([actor, ...recipients].some((id) => !people.some((p) => p.open_id === id && p.name)))
    throw new HttpError(400, '登记人员资料未核实。');
  const [claim] = await insert<Row>(table, 'request_key', {
    request_key: f.requestKey,
    applicant: actor,
    mentor: f.mentorId,
    hr,
    kind: f.kind,
    leave_type: f.leaveType,
    start_ms: start,
    end_ms: end,
    submitted_ms: now,
    payload_hash: hash,
    base_status_synced: false,
    _created_by: actor,
    _updated_by: actor,
  });
  if (!claim) return replay(api, target, await existing(f.requestKey, actor), hash);

  const label = f.kind === 'leave' ? f.leaveType : f.kind === 'late' ? '晚到' : '提前离开';
  const changes = async (values: Partial<Row>) => {
    const [updated] = await patch<Row>(table, { id: 'eq.' + claim.id }, values);
    if (!updated) throw new Error('Missing registration');
    Object.assign(claim, updated);
  };
  let record: string;
  try {
    record = await api.create(
      target,
      {
        登记编号: f.requestKey,
        申请人: [{ id: actor }],
        Mentor: [{ id: f.mentorId }],
        人事: [{ id: hr }],
        开始时间: start,
        结束时间: end,
        状态: '已登记',
        通知状态: '发送中',
        ...(f.kind === 'leave' ? { 类型: label } : { 登记类型: label, 登记时间: now }),
      },
      messageUuid('record:' + f.requestKey),
    );
  } catch {
    await changes({ record_state: 'requires_review' });
    return result(claim);
  }
  await changes({ record_state: 'created', record_id: record });
  for (const recipient of recipients) {
    let state = 'sent';
    try {
      await api.send(recipient, 'registration:' + f.requestKey + ':' + recipient, {
        title: '鸭鸭日历 · ' + label + '知会',
        content: [
          [
            {
              tag: 'text',
              text:
                (people.find((p) => p.open_id === actor)?.name || '申请人') +
                ' · ' +
                label +
                '，' +
                time(start) +
                ' 至 ' +
                time(end),
            },
          ],
          f.mentorId === hr
            ? [
                { tag: 'text', text: 'Mentor 兼人事：' },
                { tag: 'at', user_id: hr },
              ]
            : [
                { tag: 'text', text: 'Mentor：' },
                { tag: 'at', user_id: f.mentorId },
                { tag: 'text', text: '　人事：' },
                { tag: 'at', user_id: hr },
              ],
          [{ tag: 'text', text: '仅知会。登记编号 ' + f.requestKey }],
        ],
      });
    } catch {
      state = 'pending_review';
    }
    await changes({
      ...(recipient === f.mentorId && { mentor_state: state }),
      ...(recipient === hr && { hr_state: state }),
    });
  }
  return syncBaseStatus(api, target, claim);
}
