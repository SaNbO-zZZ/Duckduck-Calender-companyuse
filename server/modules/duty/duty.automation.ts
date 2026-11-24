import { LegacyWriteGate } from '../../common/legacy-write-gate';
import { Injectable, Logger } from '@nestjs/common';
import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { beijingDate } from '../../../shared/duty-calendar';
import { DutyNotificationHandler } from './duty-notification.handler';

@Injectable()
@Automation()
export class DutyAutomationTasksService {
  private readonly logger = new Logger(DutyAutomationTasksService.name);
  constructor(private readonly notifications: DutyNotificationHandler, private readonly writes: LegacyWriteGate) {}

  @BindTrigger('duty16hReminder')
  async sendDailyDutyReminder() {
    const date = beijingDate();
    this.logger.log({ event: 'duty_16h_reminder_started', dutyDate: date, timezone: 'Asia/Shanghai' });
    const result = await this.writes.run('daily-reminder', date, () => this.notifications.run(date, { allowLive: true }), result => result.state === 'accepted');
    this.logger.log({ event: 'duty_16h_reminder_finished', dutyDate: date, state: result.state });
    return result;
  }
}
