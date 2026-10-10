import { Inject, Injectable, BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { CapabilityService, FileService, AuthNPaasService, DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { and, eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { calendarSubmission } from '../../database/schema';
import type { CalendarConfig, CalendarData, CalendarEvent, Holiday, RegistrationResult, WeatherData } from '../../../shared/api.interface';
const recordSchema = z.object({ id: z.string(), record: z.record(z.string(), z.unknown()) });
const searchSchema = z.object({ records: z.array(recordSchema), hasMore: z.boolean(), pageToken: z.string().optional() });
const addSchema = z.object({ records: z.array(z.object({ id: z.string().min(1) })).length(1) });
const inputSchema = z.object({ requestKey: z.uuid(), kind: z.enum(['leave','late','early']), mentorId: z.string().regex(/^\d{1,24}$/), leaveType: z.enum(['年假','调休','事假','病假','今天不想上班','']), start: z.string().max(40), end: z.string().max(40), arrivalTime: z.string().max(8) }).strict();
const textValue = (v: unknown) => z.object({text:z.string()}).safeParse(v).data?.text || '';
function userIds(v: unknown): string[] {
 if (v == null) return [];
 const ids = z.array(z.union([z.string().regex(/^\d+$/), z.number().int().positive().safe()])).parse(v);
 return ids.map(String);
}
// The installed official Bitable v1.0.22 schema requires number[] at this single boundary.
// All business/DB/message IDs remain strings. Reject anything outside exact JS integer range.
// Do not round large IDs, change the plugin schema, or substitute a different identity.
function bitablePerson(id: string): number[] {
 if (!/^\d+$/.test(id) || BigInt(id) > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException('当前多维表格插件无法无损处理该人员帐号，请联系管理员升级人员接口。');
 const value: unknown = JSON.parse(id);
 if (typeof value !== 'number' || !Number.isSafeInteger(value) || String(value) !== id) throw new BadRequestException('人员帐号无法无损写入。');
 return [value];
}
const dateText = (ms: number) => new Date(ms + 480*60000).toISOString().slice(0,16).replace('T',' ');
const dayText = (ms: number) => dateText(ms).slice(0,10);
function stamp(text: string): number {
 if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) throw new BadRequestException('请选择完整的日期和时刻。');
 const ms = Date.parse(text + ':00+08:00');
 if (!Number.isFinite(ms) || dateText(ms).replace(' ','T') !== text) throw new BadRequestException('日期或时刻无效。');
 return ms;
}
@Injectable()
export class CalendarService {
 private readonly logger = new Logger(CalendarService.name);
 constructor(@Inject(CapabilityService) private readonly capability: CapabilityService, @Inject(AuthNPaasService) private readonly authn: AuthNPaasService, @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase, @Inject(CACHE_MANAGER) private readonly cache: Cache, @Inject(FileService) private readonly files: FileService) {}
 async sprites():Promise<unknown> {
  return this.cache.wrap('duck-calendar:sprite-data:v3',async()=>{
   const result=await this.files.download('/spark/app/app_17fstqsqv1c/runtime/api/v1/storage/object/bucket_aadkzip6foyts/1878663148282906.json');
   if(result.content.size>100000)throw new BadGatewayException('插画资源大小异常。');
   return JSON.parse(await result.content.text());
  },86400000);
 }
 async config(): Promise<CalendarConfig> {
  const result = recordSchema.parse(await this.capability.load('duck-settings').call('getRecord',{recordID:'reczz28HhfCiJdot'}));
  const ids = userIds(result.record['人事人员']);
  if (ids.length !== 1) throw new BadGatewayException('后台人事配置须有且只有一位有效人员。');
  return {hrUserId:ids[0],serverTime:Date.now()};
 }
 private overlap(start:number,end:number) {
  return {conjunction:'and',conditions:[{fieldName:'状态',operator:'is',value:['已登记']},{fieldName:'开始时间',operator:'isLess',value:['ExactDate',String(end)]},{fieldName:'结束时间',operator:'isGreater',value:['ExactDate',String(start)]}]};
 }
 private async records(id:string,input:Record<string,unknown>) {
  const result: z.infer<typeof recordSchema>[] = []; let token: string | undefined;
  for(let page=0;page<20;page++) {
   const data=searchSchema.parse(await this.capability.load(id).call('searchRecords',{...input,pageSize:500,...(token?{pageToken:token}:{})}));
   result.push(...data.records); if(!data.hasMore) return result;
   if(!data.pageToken||data.pageToken===token) throw new BadGatewayException('日历分页响应不完整。'); token=data.pageToken;
  }
  throw new BadGatewayException('本月登记数量过多，请联系管理员缩小查询范围。');
 }
 private async todayPeople(id:string,start:number,end:number) {
  const ids = new Set<string>(); let token: string|undefined;
  const schema=z.object({result:z.array(z.object({'申请人':z.object({value:z.array(z.object({id:z.union([z.string(),z.number().int().safe()])}))})})),hasMore:z.boolean(),pageToken:z.string().optional()});
  for(let page=0;page<20;page++) {
   const data=schema.parse(await this.capability.load(id).call('aggregateQuery',{dimensions:['申请人'],measures:[{fieldName:'申请人',aggregation:'count_all',alias:'entries'}],filter:this.overlap(start,end),pageSize:500,...(token?{pageToken:token}:{})}));
   data.result.forEach(r=>r['申请人'].value.forEach(p=>ids.add(String(p.id)))); if(!data.hasMore)return [...ids];
   if(!data.pageToken||data.pageToken===token)throw new BadGatewayException('今日统计分页响应不完整。');token=data.pageToken;
  }
  throw new BadGatewayException('今日统计未读取完整。');
 }
 async month(month: string):Promise<CalendarData> {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('月份格式应为 YYYY-MM。');
  const start=Date.parse(month+'-01T00:00:00+08:00'),d=new Date(start+480*60000),end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)-480*60000;
  const now=Date.now(),today=Date.parse(dayText(now)+'T00:00:00+08:00');
  const [leaves,attendance,holidays,a,b,activeLeaves,activeAttendance]=await Promise.all([
   this.records('duck-leave',{filter:this.overlap(start,end),fieldNames:['申请人','类型','开始时间','结束时间','状态']}),
   this.records('duck-attendance',{filter:this.overlap(start,end),fieldNames:['申请人','登记类型','开始时间','结束时间','状态']}),
   this.records('duck-holiday',{filter:{conjunction:'and',conditions:[{fieldName:'日期',operator:'isGreater',value:['ExactDate',String(start-1)]},{fieldName:'日期',operator:'isLess',value:['ExactDate',String(end)]}]},fieldNames:['日期','节日名','类型']}),
   this.todayPeople('duck-leave',today,today+86400000),this.todayPeople('duck-attendance',today,today+86400000),this.records('duck-leave',{filter:this.overlap(today,today+86400000),fieldNames:['申请人','类型','开始时间','结束时间','状态']}),this.records('duck-attendance',{filter:this.overlap(today,today+86400000),fieldNames:['申请人','登记类型','开始时间','结束时间','状态']})
  ]);
  const events:CalendarEvent[]=[...leaves,...attendance].map(r=>({id:r.id,userIds:userIds(r.record['申请人']),type:z.string().parse(r.record['类型'] ?? r.record['登记类型']),start:z.number().parse(r.record['开始时间']),end:z.number().parse(r.record['结束时间'])}));
  const activeEvents:CalendarEvent[]=[...activeLeaves,...activeAttendance].map(r=>({id:r.id,userIds:userIds(r.record['申请人']),type:z.string().parse(r.record['类型'] ?? r.record['登记类型']),start:z.number().parse(r.record['开始时间']),end:z.number().parse(r.record['结束时间'])})).filter(e=>e.start<=now&&e.end>now);
  const holidayData:Holiday[]=holidays.map(r=>({date:dayText(z.number().parse(r.record['日期'])),name:textValue(r.record['节日名']),type:z.string().parse(r.record['类型'])}));
  const ids=[...new Set([...events,...activeEvents].flatMap(e=>e.userIds).concat(a,b))];
  const people:CalendarData['people']=[];
  for(let i=0;i<ids.length;i+=100) {
   const batch=ids.slice(i,i+100),users=await this.authn.listUsersByIds(batch);
   users.forEach((u,j)=>people.push({id:batch[j],name:u?.name?.zh_cn||u?.name?.en_us||'帐号暂不可用',avatar:u?.avatar?.image?.large}));
  }
  return {events,activeEvents,people,holidays:holidayData,todayUserIds:[...new Set([...a,...b])],serverTime:now};
 }
 private result(row:typeof calendarSubmission.$inferSelect):RegistrationResult {
  const recorded=!!row.recordId&&row.recordState==='created',sent=row.mentorState==='sent'&&row.hrState==='sent';
  return {recorded,recordId:row.recordId,notifications:sent?'sent':'pending_review',message:sent?'已登记，已向 Mentor 和人事发送通知。':recorded?'已登记。通知尚未全部确认，请联系人事核对，勿重复提交。':'登记结果尚未确认，请联系人事凭登记编号核对，勿重复提交。'};
 }
 async submit(raw:unknown,userId:string):Promise<RegistrationResult> {
  const parsed=inputSchema.safeParse(raw);if(!parsed.success)throw new BadRequestException('登记内容无效，请检查类型、日期和 Mentor。');const input=parsed.data;
  const hash=createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const [existing]=await this.db.select().from(calendarSubmission).where(eq(calendarSubmission.requestKey,input.requestKey)).limit(1);
  if(existing){if(existing.applicant!==userId)throw new ForbiddenException('不能读取其他员工的登记。');if(existing.payloadHash!==hash)throw new ConflictException('这次登记内容已更改，请关闭后重新打开表单。');return this.result(existing);}
  const now=Date.now(),day=dayText(now);let start:number,end:number;
  if(input.kind==='leave') {if(!input.leaveType)throw new BadRequestException('请选择请假类型。');start=stamp(input.start);end=stamp(input.end);if(end<=start)throw new BadRequestException('结束时间须晚于开始时间。');if(end-start>366*86400000)throw new BadRequestException('单次登记不能超过一年。');}
  else if(input.kind==='late') {if(!/^\d{2}:\d{2}$/.test(input.arrivalTime))throw new BadRequestException('请选择预计到达时刻。');end=stamp(day+'T'+input.arrivalTime);start=stamp(day+'T09:00');if(end<=now||end<=stamp(day+'T10:00'))throw new BadRequestException('预计到达时间须晚于今天 10:00 和当前时间。');}
  else {start=now;end=Date.parse(day+'T00:00:00+08:00')+86400000;}
  const config=await this.config();const hrId:string=config.hrUserId,mentorId:string=input.mentorId;
  const [profiles,employeeIds]=await Promise.all([this.authn.listUsersByIds([userId,mentorId,hrId]),this.authn.getBatchLarkUserIds([userId,mentorId,hrId])]);
  if(profiles.some(p=>!p)||employeeIds.some(id=>!id))throw new BadRequestException('申请人、Mentor 和人事均须为有效的公司内部员工。');
  const applicantNumber=bitablePerson(userId),mentorNumber=bitablePerson(mentorId),hrNumber=bitablePerson(hrId);
  const [created]=await this.db.insert(calendarSubmission).values({requestKey:input.requestKey,applicant:userId,mentor:mentorId,hr:hrId,kind:input.kind,leaveType:input.leaveType,startMs:start,endMs:end,submittedMs:now,payloadHash:hash,createdBy:userId,updatedBy:userId}).onConflictDoNothing({target:calendarSubmission.requestKey}).returning();
  if(!created){const [row]=await this.db.select().from(calendarSubmission).where(eq(calendarSubmission.requestKey,input.requestKey)).limit(1);if(!row||row.applicant!==userId||row.payloadHash!==hash)throw new ConflictException('登记编号冲突。');return this.result(row);}
  const cap=input.kind==='leave'?'duck-leave-write':'duck-attendance';
  const fields={ '登记编号':input.requestKey,'申请人':applicantNumber,'Mentor':mentorNumber,'人事':hrNumber,'开始时间':start,'结束时间':end,'状态':'已登记','通知状态':'发送中',...(input.kind==='leave'?{'类型':input.leaveType}:{'登记类型':input.kind==='late'?'迟到':'早退','登记时间':now}) };
  let recordId:string;
  try {recordId=addSchema.parse(await this.capability.load(cap).call('batchAddRecords',{records:[{record:fields}]})).records[0].id;await this.db.update(calendarSubmission).set({recordId,recordState:'created'}).where(eq(calendarSubmission.id,created.id));}
  catch {await this.db.update(calendarSubmission).set({recordState:'requires_review'}).where(eq(calendarSubmission.id,created.id));this.logger.warn('Calendar record creation requires reconciliation');return this.result({...created,recordState:'requires_review'});}
  const title={leave:'请假登记',late:'迟到登记',early:'早退登记'}[input.kind];
  const content=`申请人：<person id="${userId}">\n${input.kind==='leave'?'类型：'+input.leaveType+'\n起止：'+dateText(start)+' 至 '+dateText(end):'登记时间：'+dateText(now)+(input.kind==='late'?'\n预计到达：'+dateText(end):'\n今天提前下班')}\nMentor：<at id="${mentorId}">\n人事：<at id="${hrId}">\n仅通知，无审批。\n登记编号：${input.requestKey}`;
  let mentorState='pending_review',hrState='pending_review';
  const send=async(recipient:string,field:'mentorState'|'hrState')=>{
   const [claim]=await this.db.update(calendarSubmission).set({[field]:'sending'}).where(and(eq(calendarSubmission.id,created.id),eq(calendarSubmission[field],'pending'))).returning();if(!claim)return false;
   try{const out=z.object({success:z.boolean()}).parse(await this.capability.load('duck-notify').call('send_feishu_message',{recipients:[recipient],title:'鸭鸭日历 · '+title,content}));await this.db.update(calendarSubmission).set({[field]:out.success?'sent':'pending_review'}).where(eq(calendarSubmission.id,created.id));return out.success;}
   catch{await this.db.update(calendarSubmission).set({[field]:'pending_review'}).where(eq(calendarSubmission.id,created.id));this.logger.warn('Calendar notification requires reconciliation');return false;}
  };
  if(await send(mentorId,'mentorState'))mentorState='sent';
  if(hrId===mentorId){hrState=mentorState;await this.db.update(calendarSubmission).set({hrState}).where(eq(calendarSubmission.id,created.id));}else if(await send(hrId,'hrState'))hrState='sent';
  try{await this.capability.load(cap).call('batchUpdateRecords',{records:[{id:recordId,record:{'通知状态':mentorState==='sent'&&hrState==='sent'?'已发送':'待核对'}}]});}catch{this.logger.warn('Calendar Base notification-state mirror requires reconciliation');}
  return this.result({...created,recordId,recordState:'created',mentorState,hrState});
 }
 async weather():Promise<WeatherData> {
  try{return await this.cache.wrap('duck-calendar:weather:yaohai:'+Math.floor(Date.now()/3600000),async()=>{
   const response=await fetch('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=31.8696&lon=117.3154',{headers:{'User-Agent':'DuckCalendar/3.0 https://alphapulsex.online'},signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('weather-source-unavailable');
   const point=z.object({time:z.string(),data:z.object({instant:z.object({details:z.object({cloud_area_fraction:z.number(),wind_speed:z.number(),wind_from_direction:z.number()})}),next_1_hours:z.object({summary:z.object({symbol_code:z.string()}),details:z.object({precipitation_amount:z.number()})}).optional()})});
   const data=z.object({properties:z.object({meta:z.object({updated_at:z.string()}),timeseries:z.array(point)})}).parse(await response.json());
   const now=Date.now(),current=data.properties.timeseries.filter(p=>Date.parse(p.time)<=now).at(-1);
   if(!current||now-Date.parse(current.time)>7200000||now-Date.parse(data.properties.meta.updated_at)>86400000)throw new Error('weather-stale');
   const detail=current.data.instant.details,symbol=current.data.next_1_hours?.summary.symbol_code||'',amount=current.data.next_1_hours?.details.precipitation_amount||0;
   const scene=symbol.includes('snow')?(symbol.includes('heavy')?'heavySnow':symbol.includes('light')?'lightSnow':'snow'):symbol.includes('rain')||symbol.includes('sleet')?(symbol.includes('heavy')||amount>=8?'storm':symbol.includes('light')||amount<2.5?'lightRain':'heavyRain'):detail.cloud_area_fraction<20?'clear':detail.cloud_area_fraction<80?'partly':'overcast';
   return {available:true,scene,windSpeed:detail.wind_speed*3.6,windFrom:detail.wind_from_direction,cloud:detail.cloud_area_fraction/100,validTime:current.time,updatedAt:data.properties.meta.updated_at,source:'MET Norway · 小时预报'};
  },30*60000);}catch{return {available:false,scene:'overcast',windSpeed:0,windFrom:0,cloud:0.9,validTime:'',updatedAt:'',source:'天气暂不可用'};}
 }
}