import { Controller, Get, Post, Query, Body, Req, UnauthorizedException } from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { CalendarService } from './calendar.service';
@Controller('api/calendar')
@NeedLogin()
export class CalendarController {
 constructor(private readonly calendar: CalendarService) {}
 @Get('sprites') sprites() {return this.calendar.sprites();}
 @Get('config') config() {return this.calendar.config();}
 @Get('month') month(@Query('month') month:string) {return this.calendar.month(month);}
 @Get('weather') weather() {return this.calendar.weather();}
 @Post('register') register(@Body() body:unknown,@Req() req:Request) {const userId=req.userContext?.userId;if(!userId)throw new UnauthorizedException('请使用公司飞书帐号登录。');return this.calendar.submit(body,userId);}
}