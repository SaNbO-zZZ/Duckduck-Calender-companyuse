import { Injectable, Logger } from '@nestjs/common';
import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { beijingDate } from '../../../shared/duty-calendar';
import { parseDutyCardCallback } from '../../../shared/duty-card-callback';
import { DutyNotificationHandler } from './duty-notification.handler';

@Injectable()
@Automation()
export class DutyAutomationTasksService {
  private readonly logger = new Logger(DutyAutomationTasksService.name);
  constructor(private readonly notifications: DutyNotificationHandler) {}

  @BindTrigger('duty16hReminder')
  async sendDailyDutyReminder() {
    const date = beijingDate();
    this.logger.log({ event: 'duty_16h_reminder_started', dutyDate: date, timezone: 'Asia/Shanghai' });
    const result = await this.notifications.run(date, { allowLive: true });
    this.logger.log({ event: 'duty_16h_reminder_finished', dutyDate: date, state: result.state });
    return result;
  }

  /**
   * Official Miaoda webhook bridge for Feishu card.action.trigger.
   *
   * The bridge stays side-effect free while the trigger is disabled and while
   * controlled validation is in progress: it only validates and acknowledges
   * the callback shape. No employee message or card update is sent here.
   */
  @BindTrigger('dutyCardCallbackBridge')
  async receiveCardCallback(context: unknown) {
    const input = (context as { content?: { input?: unknown } } | null)?.content?.input;
    const parsed = parseDutyCardCallback(input);
    if (parsed.ok === false) {
      this.logger.warn({ event: 'duty_card_callback_rejected', reason: parsed.reason });
      return { state: 'needs_review', reason: parsed.reason, outbound: 'disabled' };
    }
    const callback = parsed.value;
    this.logger.log({
      event: 'duty_card_callback_received',
      eventId: callback.eventId,
      operatorId: callback.operatorId,
      exchangeAction: callback.exchangeAction,
      requestId: callback.requestId,
      outbound: 'disabled',
    });
    return {
      state: 'received',
      eventId: callback.eventId,
      exchangeAction: callback.exchangeAction,
      requestId: callback.requestId ?? null,
      outbound: 'disabled',
    };
  }
}
