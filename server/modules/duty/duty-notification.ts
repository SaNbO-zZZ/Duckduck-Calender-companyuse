import { notificationIdempotencyKey, type ResolvedDuty } from '../../../shared/duty-calendar';

export type NotificationDeliveryState = 'accepted' | 'failed' | 'needs_review' | 'pending';

export interface DutyNotificationPlan {
  dutyDate: string;
  weekday: number;
  finalPersonId: string;
  idempotencyKey: string;
  title: string;
  content: string;
  state: NotificationDeliveryState;
}

export function buildDutyNotificationPlan(duty: ResolvedDuty, personName: string, entryUrl: string): DutyNotificationPlan {
  const weekdayLabel = '一二三四五六日'[duty.weekday - 1];
  return {
    dutyDate: duty.date,
    weekday: duty.weekday,
    finalPersonId: duty.personId,
    idempotencyKey: notificationIdempotencyKey(duty.date, duty.personId),
    title: `鸭鸭日历 · ${duty.date} 值日提醒`,
    content: `${duty.date}（周${weekdayLabel}）轮到 ${personName} 铲屎了。\n请记得完成今天的值日提醒。\n鸭鸭日历入口：${entryUrl}`,
    state: 'pending',
  };
}
