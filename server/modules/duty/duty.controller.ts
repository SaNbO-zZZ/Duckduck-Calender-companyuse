import { Body, Controller, Get, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { DutyService } from './duty.service';

@Controller('api/duty')
@NeedLogin()
export class DutyController {
  constructor(private readonly duty: DutyService) {}
  @Get('manifest') manifest() { return this.duty.manifest(); }
  @Get('day') day(@Query('date') date?: string) { return this.duty.day(date); }
  @Get('notification-preview') notificationPreview(@Query('date') date?: string, @Query('entryUrl') entryUrl?: string) { return this.duty.notificationPreview(date, entryUrl); }
  @Post('exchange-requests') createExchange(@Body() body: unknown, @Req() req: Request) {
    const userId = req.userContext?.userId;
    if (!userId) throw new UnauthorizedException('请使用公司飞书帐号登录。');
    return this.duty.createExchange(body, userId);
  }
  @Get('exchange-requests/:id') getExchange(@Param('id') id: string, @Req() req: Request) {
    const userId = req.userContext?.userId;
    if (!userId) throw new UnauthorizedException('请使用公司飞书帐号登录。');
    return this.duty.getExchange(id, userId);
  }
  @Post('exchange-requests/:id/decision') decideExchange(@Param('id') id: string, @Body() body: unknown, @Req() req: Request) {
    const userId = req.userContext?.userId;
    if (!userId) throw new UnauthorizedException('请使用公司飞书帐号登录。');
    return this.duty.decideExchange(id, body, userId);
  }
}
