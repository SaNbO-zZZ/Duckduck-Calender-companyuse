import { LegacyWriteGateModule } from '../../common/legacy-write-gate.module';
import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { ReleaseAnnouncementService } from './release-announcement.service';
@Module({ imports: [LegacyWriteGateModule], controllers: [CalendarController], providers: [CalendarService, ReleaseAnnouncementService] })
export class CalendarModule {}