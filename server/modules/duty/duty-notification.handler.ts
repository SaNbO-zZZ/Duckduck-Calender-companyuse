import { Injectable, Logger } from '@nestjs/common';
import { AuthNPaasService, CapabilityService, DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { dutyNotificationDelivery } from '../../database/schema';
import { notificationIdempotencyKey } from '../../../shared/duty-calendar';
import { DutyService } from './duty.service';

export interface DutyNotificationRunOptions { entryUrl?: string; controlledRecipient?: string; allowLive?: boolean; }

@Injectable()
export class DutyNotificationHandler {
  private readonly logger = new Logger(DutyNotificationHandler.name);
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase, @Inject(CapabilityService) private readonly capability: CapabilityService, @Inject(AuthNPaasService) private readonly authn: AuthNPaasService, private readonly duty: DutyService) {}

  /** Cron handler body. Local verification requires a controlled recipient; the
   * published, disabled-by-default cron binding is the only live path. */
  async run(date: string, options: DutyNotificationRunOptions = {}) {
    const resolved = await this.duty.day(date);
    if (!resolved.duty || !resolved.personValid) return { state: 'needs_review', reason: '负责人无效或排班未配置。', dutyDate: date };
    const key = notificationIdempotencyKey(date, resolved.duty.personId);
    const [existing] = await this.db.select().from(dutyNotificationDelivery).where(eq(dutyNotificationDelivery.idempotencyKey, key)).limit(1);
    if (existing && ['accepted', 'needs_review'].includes(existing.state)) return { state: existing.state, idempotencyKey: key, dutyDate: date };
    const recipient = options.controlledRecipient || resolved.duty.personId;
    if (!options.controlledRecipient && !options.allowLive) return { state: 'needs_review', idempotencyKey: key, dutyDate: date, reason: '真实通知必须由已发布的妙搭触发器执行；本地阶段要求受控收件人。' };
    const profileIds = await this.authn.getBatchLarkUserIds([recipient]);
    if (profileIds.length !== 1 || !profileIds[0]) return { state: 'needs_review', idempotencyKey: key, dutyDate: date, reason: '受控收件人无法映射为飞书消息用户。' };
    const [claimed] = existing ? [existing] : await this.db.insert(dutyNotificationDelivery).values({ idempotencyKey: key, dutyDate: date, finalPersonId: resolved.duty.personId, state: 'pending', attemptCount: 0, createdBy: resolved.duty.personId, updatedBy: resolved.duty.personId }).onConflictDoNothing({ target: dutyNotificationDelivery.idempotencyKey }).returning();
    if (!claimed) return { state: 'needs_review', idempotencyKey: key, dutyDate: date, reason: '通知幂等记录竞争未确认。' };
    try {
      const response = await this.capability.load('duck-notify').call('send_feishu_message', { recipients: [profileIds[0]], title: `鸭鸭日历 · ${date} 值日提醒`, content: `${date} 轮到 ${resolved.personName || '负责人'} 铲屎了。\n请记得完成今天的值日提醒。\n鸭鸭日历入口：${options.entryUrl || '/app/app_17fstqsqv1c'}` });
      const success = Boolean((response as { success?: boolean }).success);
      await this.db.update(dutyNotificationDelivery).set({ state: success ? 'accepted' : 'needs_review', attemptCount: (claimed.attemptCount || 0) + 1, updatedBy: resolved.duty.personId }).where(and(eq(dutyNotificationDelivery.idempotencyKey, key), eq(dutyNotificationDelivery.state, 'pending')));
      return { state: success ? 'accepted' : 'needs_review', idempotencyKey: key, dutyDate: date };
    } catch (error) {
      this.logger.warn({ event: 'duty_notification_needs_review', idempotencyKey: key, error: error instanceof Error ? error.message : 'unknown' });
      await this.db.update(dutyNotificationDelivery).set({ state: 'needs_review', attemptCount: (claimed.attemptCount || 0) + 1, errorCode: 'send_exception', updatedBy: resolved.duty.personId }).where(eq(dutyNotificationDelivery.idempotencyKey, key));
      return { state: 'needs_review', idempotencyKey: key, dutyDate: date };
    }
  }
}
