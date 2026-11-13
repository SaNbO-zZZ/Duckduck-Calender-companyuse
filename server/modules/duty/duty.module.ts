import { Module } from '@nestjs/common';
import { DutyController } from './duty.controller';
import { DutyService } from './duty.service';
import { DutyNotificationHandler } from './duty-notification.handler';
import { DutyAutomationTasksService } from './duty.automation';

@Module({ controllers: [DutyController], providers: [DutyService, DutyNotificationHandler, DutyAutomationTasksService] })
export class DutyModule {}
