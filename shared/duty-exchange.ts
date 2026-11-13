import { canTransitionExchange, exchangeIsExpired, parseBeijingDate, type ExchangeState } from './duty-calendar';

export type DutyExchangeDecision = 'confirm' | 'reject' | 'cancel';
export type DutyExchangeAction = 'submit' | DutyExchangeDecision | 'apply' | 'expire';

export interface ExchangeReduction {
  state: ExchangeState;
  idempotent: boolean;
  applyOverride: boolean;
}

/** Beijing 16:00 on the duty date is the hard cut-off for a pending exchange. */
export function exchangeCutoffMs(dutyDate: string): number {
  return parseBeijingDate(dutyDate) + 16 * 60 * 60 * 1000;
}

export function exchangeOpenUrl(requestId: string, baseUrl = '/app/app_17fstqsqv1c'): string {
  if (!requestId.trim()) throw new Error('换班请求 ID 不能为空。');
  return `${baseUrl.replace(/\/$/, '')}/duty-exchange?requestId=${encodeURIComponent(requestId)}`;
}

/**
 * Pure state reducer used by the service and tests. Terminal states are
 * idempotent so a retried confirmation page cannot create a second override.
 */
export function reduceExchange(state: ExchangeState, action: DutyExchangeAction, expiresAtMs?: number, nowMs = Date.now()): ExchangeReduction {
  if (state === 'awaiting_confirmation' && expiresAtMs != null && exchangeIsExpired(state, expiresAtMs, nowMs)) {
    return { state: canTransitionExchange(state, 'expire'), idempotent: false, applyOverride: false };
  }
  if (state === 'applied' || state === 'rejected' || state === 'cancelled' || state === 'expired') {
    return { state, idempotent: true, applyOverride: false };
  }
  const next = canTransitionExchange(state, action);
  return { state: next, idempotent: false, applyOverride: next === 'applied' };
}
