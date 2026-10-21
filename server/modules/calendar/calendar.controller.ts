import { Controller, Get, Post, Query, Body, Req, Header, UnauthorizedException } from '@nestjs/common';
import { CanRole, NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { CalendarService } from './calendar.service';
import { ReleaseAnnouncementService } from './release-announcement.service';
@Controller('api/calendar')
@NeedLogin()
export class CalendarController {
 constructor(private readonly calendar: CalendarService, private readonly announcements: ReleaseAnnouncementService) {}
 @Get('sprites') sprites() {return this.calendar.sprites();}
 @Get('config') config() {return this.calendar.config();}
 @Get('month') month(@Query('month') month:string) {return this.calendar.month(month);}
 @Get('weather') weather() {return this.calendar.weather();}
 @Get('registration-status') @Header('Cache-Control','no-store') async status(@Query('requestKey') requestKey:string,@Req() req:Request) {const userId=req.userContext?.userId;if(!userId)throw new UnauthorizedException('请使用公司飞书帐号登录。');return {result:await this.calendar.status(requestKey,userId)};}
 @Post('register') register(@Body() body:unknown,@Req() req:Request) {const userId=req.userContext?.userId;if(!userId)throw new UnauthorizedException('请使用公司飞书帐号登录。');return this.calendar.submit(body,userId);}
 @Get('release-announcement/preview') @CanRole(['release_announcer']) previewAnnouncement() {return this.announcements.preview();}
 @Get('release-announcement/status') @CanRole(['release_announcer']) announcementStatus(@Query('version') version:string) {return this.announcements.summary(version);}
 @Post('release-announcement/publish') @CanRole(['release_announcer']) publishAnnouncement(@Body() body:unknown,@Req() req:Request) {const userId=req.userContext?.userId;if(!userId)throw new UnauthorizedException('请使用公司飞书帐号登录。');return this.announcements.publish(body,userId);}
}