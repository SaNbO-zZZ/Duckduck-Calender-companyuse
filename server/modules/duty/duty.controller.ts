import { Controller, Get, Query } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { DutyService } from './duty.service';

@Controller('api/duty')
@NeedLogin()
export class DutyController {
  constructor(private readonly duty: DutyService) {}
  @Get('manifest') manifest() { return this.duty.manifest(); }
  @Get('day') day(@Query('date') date?: string) { return this.duty.day(date); }
  @Get('notification-preview') notificationPreview(@Query('date') date?: string, @Query('entryUrl') entryUrl?: string) { return this.duty.notificationPreview(date, entryUrl); }
}
