import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  applyAvatarBinding,
  beijingDate,
  parseBeijingDate,
  planDutySelection,
  weekdayOf,
  type DutyRule,
} from '../shared/duty-calendar.js';
import { dutyAssetManifest } from '../shared/duty-assets.js';
import { exchangeOpenUrl } from '../shared/duty-exchange.js';
import { db, HttpError, previewReadOnly } from './feishu-auth.js';
import { directory, input, patch, query } from './business-http.js';
import { Feishu, openId } from './feishu-platform.js';

export const daySchema = z.string().refine((day) => {
  try {
    parseBeijingDate(day);
    return true;
  } catch {
    return false;
  }
});
export async function dutyDay(date: string, today = beijingDate()) {
  input(daySchema, date);
  const [rules, overrides] = await Promise.all([
    db<DutyRule[]>(
      query('duty_weekly_rule', {
        select:
          'weekday,personId:person_open_id,duckKey:duck_key,validFrom:valid_from,validTo:valid_to,status',
        status: 'eq.active',
        order: 'valid_from.desc,id.asc',
      }),
    ),
    db<Parameters<typeof planDutySelection>[3]>(
      query('duty_override', {
        select:
          'dutyDate:duty_date,originalPersonId:original_person_open_id,replacementPersonId:replacement_person_open_id,replacementDuckKey:replacement_duck_key,status',
        duty_date: 'eq.' + date,
        status: 'eq.active',
      }),
    ),
  ]);
  const plan = planDutySelection(date, today, rules, overrides);
  let duty = plan.duty,
    personName: string | null = null;
  if (duty) {
    const [people, bindings] = await Promise.all([
      directory([duty.personId]),
      db<{ personId: string; duckKey: string }[]>(
        query('duty_avatar_binding', {
          select: 'personId:person_open_id,duckKey:duck_key',
          person_open_id: 'eq.' + duty.personId,
          status: 'eq.active',
        }),
      ),
    ]);
    duty = applyAvatarBinding(duty, bindings[0]);
    personName = people[0]?.name || null;
  }
  return {
    ...plan,
    duty,
    personName,
    personValid: Boolean(personName),
    weekday: weekdayOf(date),
    manifestVersion: dutyAssetManifest.manifestVersion,
  };
}

type Exchange = {
  id: string;
  duty_date: string;
  state: string;
  initiator_open_id: string;
  invitee_open_id: string;
  _expires_at: string;
  _confirmed_at: string | null;
  invite_delivery: string;
  decision_delivery: string;
};
const exchangeForm = z
  .object({ dutyDate: daySchema, inviteeId: openId, requestId: z.uuid().optional() })
  .strict();
const decisions = z.object({ decision: z.enum(['confirm', 'reject', 'cancel']) }).strict();

async function previewExchange(id: string, actor: string) {
  const rows = await db<Exchange[]>(query('duty_exchange_request', {
    id: 'eq.' + id,
    or: '(initiator_open_id.eq.' + actor + ',invitee_open_id.eq.' + actor + ')',
  }));
  const row = rows[0];
  if (!row) throw new HttpError(404, '换班请求不存在。');
  return row.state === 'awaiting_confirmation' && Date.parse(row._expires_at) <= Date.now()
    ? { ...row, state: 'expired' }
    : row;
}

export async function exchange(
  api: Feishu,
  actor: string,
  origin: string,
  id: string | undefined,
  raw?: unknown,
) {
  const create = id === undefined ? input(exchangeForm, raw) : null;
  const action = create ? 'create' : raw === undefined ? 'read' : input(decisions, raw).decision;
  const requestId = create ? create.requestId || randomUUID() : input(z.uuid(), id);
  const response = action === 'read' && previewReadOnly()
    ? await previewExchange(requestId, actor)
    : await db<Exchange | Exchange[]>('rpc/ducky_exchange', 'POST', {
        p_actor: actor,
        p_action: action,
        p_id: requestId,
        p_day: create?.dutyDate ?? null,
        p_invitee: create?.inviteeId ?? null,
      });
  const row = Array.isArray(response) ? response[0] : response;
  if (!row?.id || (Array.isArray(response) && response.length !== 1))
    throw new HttpError(502, '换班回执无效。');
  const url = exchangeOpenUrl(row.id, origin);
  const people = await directory([row.initiator_open_id, row.invitee_open_id]);
  const name = (person: string) => people.find((p) => p.open_id === person)?.name || '账号暂不可用';
  const invite = action === 'create' && row.state === 'awaiting_confirmation';
  const decision =
    (action === 'confirm' && row.state === 'applied') ||
    (action === 'reject' && row.state === 'rejected') ||
    (action === 'cancel' && row.state === 'cancelled');
  const field = invite ? 'invite_delivery' : 'decision_delivery';
  if (invite || decision) {
    const [claim] = await patch<Exchange>(
      'duty_exchange_request',
      { id: 'eq.' + row.id, [field]: 'eq.pending' },
      { [field]: 'sending' },
    );
    if (claim) {
      const recipient = invite || action === 'cancel' ? row.invitee_open_id : row.initiator_open_id;
      const title = invite
        ? '值日换班邀请'
        : '值日换班' + ({ applied: '已生效', rejected: '已拒绝', cancelled: '已取消' }[row.state] || '');
      let state = 'sent';
      try {
        await api.send(recipient, 'exchange:' + row.id + ':' + field, {
          title,
          content: [
            [
              {
                tag: 'text',
                text:
                  row.duty_date +
                  ' · ' +
                  name(row.initiator_open_id) +
                  ' 邀请 ' +
                  name(row.invitee_open_id) +
                  ' 接替值日。',
              },
            ],
            [{ tag: 'a', text: '打开换班详情', href: url }],
          ],
        });
      } catch {
        state = 'needs_review';
      }
      await patch(
        'duty_exchange_request',
        { id: 'eq.' + row.id, [field]: 'eq.sending' },
        { [field]: state },
      );
      row[field] = state;
    }
  }
  return {
    requestId: row.id,
    dutyDate: row.duty_date,
    state: row.state,
    expiresAt: row._expires_at,
    confirmedAt: row._confirmed_at,
    initiatorName: name(row.initiator_open_id),
    inviteeName: name(row.invitee_open_id),
    originalPersonName: name(row.initiator_open_id),
    replacementPersonName: name(row.invitee_open_id),
    viewerRole: actor === row.initiator_open_id ? 'initiator' : 'invitee',
    openUrl: url,
    inviteDelivery: row.invite_delivery,
    decisionDelivery: row.decision_delivery,
    message: action === 'read'
      ? (row[field] === 'needs_review' ? '私聊投递待核对。' : '')
      : (row[field] === 'needs_review' ? '换班状态已保存，私聊投递待核对。' : '换班状态已保存。'),
  };
}

type ReminderClaim = {
  claimed: boolean;
  state: string;
  dutyDate: string;
  recipient: string;
  id: string;
  key: string;
};
export async function remind(api: Feishu, origin: string) {
  const claim = await db<ReminderClaim>('rpc/ducky_claim_reminder', 'POST', {});
  if (!claim.claimed) {
    if (['needs_review', 'pending'].includes(claim.state)) throw new HttpError(503, '值日投递待核对。');
    return { state: claim.state, dutyDate: claim.dutyDate, sent: false };
  }
  let state = 'accepted';
  try {
    await api.send(claim.recipient, 'reminder:' + claim.key, {
      title: '鸭鸭日历 · 16:00 值日提醒',
      content: [
        [
          { tag: 'at', user_id: claim.recipient },
          { tag: 'text', text: '，' + claim.dutyDate + ' 轮到你铲屎了。' },
        ],
        [{ tag: 'a', text: '打开鸭鸭日历', href: origin }],
      ],
    });
  } catch {
    state = 'needs_review';
  }
  await patch(
    'duty_notification_delivery',
    { id: 'eq.' + claim.id, state: 'eq.pending' },
    {
      state,
      _accepted_at: state === 'accepted' ? new Date().toISOString() : null,
      error_code: state === 'accepted' ? null : 'unconfirmed_send',
    },
  );
  if (state !== 'accepted') throw new HttpError(502, '飞书提醒投递待核对。');
  return { state, dutyDate: claim.dutyDate, sent: true };
}
