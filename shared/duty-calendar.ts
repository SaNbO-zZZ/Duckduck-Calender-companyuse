export type DutyWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type DutyMode = 'hidden' | 'dialogue' | 'queue';
export type DutyAnimationState = 'idle' | 'reacting' | 'walking' | 'queueing' | 'peek' | 'complete';
export type ExchangeState = 'draft' | 'awaiting_confirmation' | 'confirmed' | 'applied' | 'rejected' | 'cancelled' | 'expired';

export interface DutyRule {
  weekday: DutyWeekday;
  personId: string;
  duckKey: string;
  validFrom?: string;
  validTo?: string | null;
  status?: 'active' | 'inactive';
}
export interface DutyOverride {
  dutyDate: string;
  originalPersonId: string;
  replacementPersonId: string;
  replacementDuckKey?: string;
  status: 'pending' | 'active' | 'cancelled' | 'expired';
}
export interface ResolvedDuty {
  date: string;
  weekday: DutyWeekday;
  personId: string;
  duckKey: string;
  source: 'weekly' | 'override';
}

export interface DutyAvatarBinding {
  personId: string;
  duckKey: string;
  manifestVersion?: string;
  status?: 'active' | 'inactive';
}
export interface DutySelection {
  selectedDate: string;
  today: string;
  mode: DutyMode;
  duty: ResolvedDuty | null;
  queue: DutyWeekday[];
  locked: boolean;
  copy: string;
}

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function beijingDate(ms = Date.now()): string {
  return new Date(ms + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export function parseBeijingDate(value: string): number {
  if (!ISO_DAY.test(value)) throw new Error('日期必须是 YYYY-MM-DD。');
  const ms = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(ms) || beijingDate(ms) !== value) throw new Error('日期无效。');
  return ms;
}

export function compareNaturalDate(a: string, b: string): number {
  parseBeijingDate(a); parseBeijingDate(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function weekdayOf(value: string): DutyWeekday {
  const ms = parseBeijingDate(value);
  const day = new Date(ms + BEIJING_OFFSET_MS).getUTCDay();
  return (day === 0 ? 7 : day) as DutyWeekday;
}

export function addBeijingDays(value: string, days: number): string {
  return beijingDate(parseBeijingDate(value) + days * 86400000);
}

export function queueAfter(weekday: DutyWeekday): DutyWeekday[] {
  return Array.from({ length: 6 }, (_, index) => ((weekday - 1 + index + 1) % 7 + 1) as DutyWeekday);
}

function activeRule(rule: DutyRule, date: string): boolean {
  return (rule.status ?? 'active') === 'active'
    && (!rule.validFrom || compareNaturalDate(date, rule.validFrom) >= 0)
    && (!rule.validTo || compareNaturalDate(date, rule.validTo) <= 0);
}

export function resolveDuty(date: string, rules: DutyRule[], overrides: DutyOverride[] = []): ResolvedDuty | null {
  parseBeijingDate(date);
  const override = overrides.find(item => item.dutyDate === date && item.status === 'active');
  const rule = rules.find(item => item.weekday === weekdayOf(date) && activeRule(item, date));
  if (!rule && !override) return null;
  if (override) return {
    date,
    weekday: weekdayOf(date),
    personId: override.replacementPersonId,
    duckKey: override.replacementDuckKey || rule?.duckKey || 'fallback',
    source: 'override',
  };
  return { date, weekday: rule!.weekday, personId: rule!.personId, duckKey: rule!.duckKey, source: 'weekly' };
}

/**
 * Apply the independently managed person → duck binding after the final duty
 * person has been resolved. The binding is intentionally ignored when it is
 * inactive or points to an empty role, so a valid schedule row remains a safe
 * fallback during migration.
 */
export function applyAvatarBinding(duty: ResolvedDuty, binding?: DutyAvatarBinding | null): ResolvedDuty {
  if (!binding || (binding.status ?? 'active') !== 'active' || !binding.duckKey.trim()) return duty;
  return { ...duty, duckKey: binding.duckKey };
}

export function planDutySelection(selectedDate: string, today: string, rules: DutyRule[], overrides: DutyOverride[] = []): DutySelection {
  parseBeijingDate(selectedDate); parseBeijingDate(today);
  if (compareNaturalDate(selectedDate, today) < 0) {
    return { selectedDate, today, mode: 'hidden', duty: null, queue: [], locked: false, copy: '历史日期不展示值日负责人。' };
  }
  const duty = resolveDuty(selectedDate, rules, overrides);
  if (!duty) return { selectedDate, today, mode: 'hidden', duty: null, queue: [], locked: false, copy: '当天还没有可用的值日配置。' };
  const sameWeekdayFuture = selectedDate !== today && weekdayOf(selectedDate) === weekdayOf(today);
  if (sameWeekdayFuture) return { selectedDate, today, mode: 'dialogue', duty, queue: [], locked: false, copy: '我记得，我会好好铲屎。' };
  return { selectedDate, today, mode: 'queue', duty, queue: queueAfter(duty.weekday), locked: true, copy: `${selectedDate === today ? '今天' : selectedDate} 是周${'一二三四五六日'[duty.weekday - 1]}，轮到你铲屎了。` };
}

export function notificationIdempotencyKey(date: string, personId: string): string {
  parseBeijingDate(date);
  if (!personId.trim()) throw new Error('负责人 ID 不能为空。');
  return `${date}:${personId}`;
}

const NEXT_ANIMATION: Record<DutyAnimationState, DutyAnimationState> = {
  idle: 'reacting', reacting: 'walking', walking: 'queueing', queueing: 'peek', peek: 'complete', complete: 'idle',
};
export function nextAnimationState(state: DutyAnimationState): DutyAnimationState { return NEXT_ANIMATION[state]; }
export function isAnimationLocked(state: DutyAnimationState): boolean { return state !== 'idle' && state !== 'complete'; }

export function canTransitionExchange(state: ExchangeState, action: 'submit' | 'confirm' | 'reject' | 'cancel' | 'apply' | 'expire'): ExchangeState {
  if (action === 'submit' && state === 'draft') return 'awaiting_confirmation';
  if (action === 'confirm' && state === 'awaiting_confirmation') return 'confirmed';
  if (action === 'reject' && state === 'awaiting_confirmation') return 'rejected';
  if (action === 'cancel' && (state === 'draft' || state === 'awaiting_confirmation')) return 'cancelled';
  if (action === 'apply' && state === 'confirmed') return 'applied';
  if (action === 'expire' && state === 'awaiting_confirmation') return 'expired';
  throw new Error(`换班状态 ${state} 不能执行 ${action}。`);
}

export function canInitiateExchange(initiatorId: string, originalPersonId: string, dutyDate: string): boolean {
  parseBeijingDate(dutyDate);
  return Boolean(initiatorId.trim()) && initiatorId === originalPersonId;
}

export function exchangeIsExpired(state: ExchangeState, expiresAtMs: number, nowMs = Date.now()): boolean {
  return state === 'awaiting_confirmation' && nowMs >= expiresAtMs;
}
