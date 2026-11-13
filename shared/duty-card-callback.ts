export type DutyCardExchangeAction = 'submit' | 'confirm' | 'reject' | 'cancel' | 'apply' | 'unknown';

export interface DutyCardCallback {
  eventId: string;
  eventType: 'card.action.trigger';
  operatorId: string;
  messageId?: string;
  chatId?: string;
  actionTag?: string;
  actionValue: Record<string, unknown>;
  exchangeAction: DutyCardExchangeAction;
  requestId?: string;
}

export type DutyCardCallbackParseResult = {
  ok: true;
  value: DutyCardCallback;
} | {
  ok: false;
  reason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseValue(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function actionFromValue(value: Record<string, unknown>): DutyCardExchangeAction {
  const action = stringValue(value.action) || stringValue(value.exchangeAction) || stringValue(value.key);
  if (action === 'submit' || action === 'confirm' || action === 'reject' || action === 'cancel' || action === 'apply') return action;
  if (action === 'exchange_submit') return 'submit';
  if (action === 'exchange_confirm') return 'confirm';
  if (action === 'exchange_reject') return 'reject';
  if (action === 'exchange_cancel') return 'cancel';
  if (action === 'exchange_apply') return 'apply';
  return 'unknown';
}

/**
 * Parse the official Feishu card.action.trigger payload after a Miaoda
 * webhook trigger has decoded the HTTP body. This parser intentionally
 * accepts both the raw callback envelope and the flattened lark-cli shape,
 * while rejecting missing identity/event fields before any business action.
 */
export function parseDutyCardCallback(input: unknown): DutyCardCallbackParseResult {
  if (!isRecord(input)) return { ok: false, reason: '回调 body 必须是 JSON 对象。' };

  const header = isRecord(input.header) ? input.header : input;
  const event = isRecord(input.event) ? input.event : input;
  const action = isRecord(event.action) ? event.action : event;
  const operator = isRecord(event.operator) ? event.operator : event;
  const eventType = stringValue(header.event_type) || stringValue(input.type);
  const eventId = stringValue(header.event_id) || stringValue(input.event_id);
  const operatorId = stringValue(operator.open_id) || stringValue(operator.user_id) || stringValue(input.operator_id);
  if (eventType !== 'card.action.trigger') return { ok: false, reason: '不是 card.action.trigger 回调。' };
  if (!eventId) return { ok: false, reason: '回调缺少 event_id。' };
  if (!operatorId) return { ok: false, reason: '回调缺少操作人 ID。' };

  const actionValue = parseValue(action.value ?? input.action_value);
  return {
    ok: true,
    value: {
      eventId,
      eventType: 'card.action.trigger',
      operatorId,
      messageId: stringValue(input.context && isRecord(input.context) ? input.context.open_message_id : input.message_id),
      chatId: stringValue(input.context && isRecord(input.context) ? input.context.open_chat_id : input.chat_id),
      actionTag: stringValue(action.tag) || stringValue(input.action_tag),
      actionValue,
      exchangeAction: actionFromValue(actionValue),
      requestId: stringValue(actionValue.requestId) || stringValue(actionValue.request_id),
    },
  };
}
