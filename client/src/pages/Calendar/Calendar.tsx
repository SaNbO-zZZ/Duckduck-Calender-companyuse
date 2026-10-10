import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { isAxiosError } from 'axios';
import { UserSelect } from '../../components/business-ui/user-select';
import { UserDisplay } from '../../components/business-ui/user-display';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '../../components/ui/form';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { Calendar as DatePicker } from '../../components/ui/calendar';
import { zhCN } from 'date-fns/locale';
import { calendarDocument } from './calendar-document';
import type { CalendarConfig, CalendarData, RegistrationKind, RegistrationRequest, RegistrationResult, WeatherData } from '../../../../shared/api.interface';
const today = (ms=Date.now()) => new Date(ms+480*60000).toISOString().slice(0,10);
const dateLabel = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const timeText = (ms:number) => new Date(ms+480*60000).toISOString().slice(0,16).replace('T',' ')+'（北京时间）';
const apiMessage=(error:unknown)=> {if(isAxiosError(error)&&error.response){const result=z.union([z.object({message:z.union([z.string(),z.array(z.string())])}),z.object({error:z.object({message:z.string()})})]).safeParse(error.response.data);if(result.success){const message='error' in result.data?result.data.error.message:result.data.message;return Array.isArray(message)?message.join('；'):message;}}return '网络请求未确认，请勿重复创建登记。可以核对本次登记结果。';};
const schema=z.object({mentorId:z.string().min(1,'请选择你的 Mentor'),leaveType:z.enum(['年假','调休','事假','病假','今天不想上班']),startDate:z.date(),startTime:z.string().regex(/^\d{2}:\d{2}$/,'请选择开始时刻'),endDate:z.date(),endTime:z.string().regex(/^\d{2}:\d{2}$/,'请选择结束时刻'),arrivalTime:z.string().regex(/^\d{2}:\d{2}$/,'请选择预计到达时刻')});
type Values=z.infer<typeof schema>;
const title={leave:'申请请假',late:'天才总是晚到',early:'我先去拯救世界了'};
function RegisterForm({kind,config,onDone,onClose,onBusy}:{kind:RegistrationKind;config:CalendarConfig;onDone:()=>void;onClose:()=>void;onBusy:(value:boolean)=>void}){
 const offset=useRef(config.serverTime-Date.now()),[now,setNow]=useState(Date.now()+offset.current),[busy,setBusy]=useState(false),[result,setResult]=useState<RegistrationResult|null>(null),[error,setError]=useState(''),key=useRef(crypto.randomUUID()),snapshot=useRef<RegistrationRequest|null>(null);
 const defaultDay=today(now),defaultDate=new Date(defaultDay+'T12:00:00'),arrival=new Date(Math.min(Date.parse(defaultDay+'T23:59:00+08:00'),Math.max(now+30*60000,Date.parse(defaultDay+'T10:01:00+08:00')))+480*60000).toISOString().slice(11,16);
 const form=useForm<Values>({resolver:zodResolver(schema),defaultValues:{mentorId:'',leaveType:'年假',startDate:defaultDate,startTime:'09:00',endDate:defaultDate,endTime:'18:00',arrivalTime:arrival}});
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+offset.current),1000);return()=>clearInterval(timer);},[]);
 const submit=async(data:Values)=>{
  if(busy||result)return;
  if(!snapshot.current){
   const request:RegistrationRequest={requestKey:key.current,kind,mentorId:data.mentorId,leaveType:kind==='leave'?data.leaveType:'',start:kind==='leave'?dateLabel(data.startDate)+'T'+data.startTime:'',end:kind==='leave'?dateLabel(data.endDate)+'T'+data.endTime:'',arrivalTime:kind==='late'?data.arrivalTime:''};
   if(kind==='leave'&&request.end<=request.start){form.setError('endTime',{message:'结束时间须晚于开始时间。'});return;}
   if(kind==='late'&&(Date.parse(today(now)+'T'+data.arrivalTime+':00+08:00')<=now||data.arrivalTime<='10:00')){form.setError('arrivalTime',{message:'预计到达须晚于今天 10:00 和当前时间。'});return;}
   snapshot.current=request;
  }
  setBusy(true);onBusy(true);setError('');
  try {const r=await axiosForBackend<RegistrationResult>({url:'/api/calendar/register',method:'POST',data:snapshot.current,timeout:120000});setResult(r.data);if(r.data.recorded)onDone();}
  catch(e){setError(apiMessage(e));if(isAxiosError(e)&&e.response&&e.response.status<500)snapshot.current=null;}
  finally{setBusy(false);onBusy(false);}
 };
 const dateField=(name:'startDate'|'endDate',label:string)=><FormField control={form.control} name={name} render={({field})=><FormItem className="flex-1 min-w-0"><FormLabel>{label}日期</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button type="button" variant="outline" className="w-full justify-start rounded-2xl">{dateLabel(field.value)}</Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><DatePicker mode="single" locale={zhCN} selected={field.value} onSelect={d=>d&&field.onChange(d)} /></PopoverContent></Popover><FormMessage /></FormItem>} />;
 const timeField=(name:'startTime'|'endTime'|'arrivalTime',label:string)=><FormField control={form.control} name={name} render={({field})=><FormItem className="flex-1 min-w-0"><FormLabel>{label}</FormLabel><FormControl><Input type="time" className="rounded-2xl" {...field}/></FormControl><FormMessage/></FormItem>}/>;
 return <Form {...form}><form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
  <fieldset disabled={busy||!!snapshot.current||!!result} className="space-y-5 min-w-0">
  {kind==='leave'?<><FormField control={form.control} name="leaveType" render={({field})=><FormItem><FormLabel>类型<span aria-hidden="true" className="text-red-500"> *</span></FormLabel><FormControl><div className="flex flex-wrap gap-2" role="radiogroup" aria-label="请假类型">{(['年假','调休','事假','病假','今天不想上班'] as const).map((name,i)=><Button type="button" key={name} role="radio" aria-checked={field.value===name} onClick={()=>field.onChange(name)} className={'rounded-full '+(field.value===name?'bg-[#ff7957] text-white hover:bg-[#f66d4b]':'bg-[#f5f3f0] text-[#38332e] hover:bg-[#eee9e3]')}>{['🌴','↔️','📝','🤒','📌'][i]} {name}</Button>)}</div></FormControl><FormMessage/></FormItem>}/><div className="flex gap-3">{dateField('startDate','开始')}{timeField('startTime','开始时刻')}</div><div className="flex gap-3">{dateField('endDate','结束')}{timeField('endTime','结束时刻')}</div></>:<><div><p className="mb-2 font-medium">当前时间</p><p className="rounded-2xl bg-[#f6f4f1] p-3 text-sm" role="timer">{timeText(now)}</p></div>{kind==='late'&&<>{timeField('arrivalTime','预计到达时间')}<p className="text-sm text-[#8d8074]">预计今天到达，须晚于 10:00 和当前时间。</p></>}</>}
  <FormField control={form.control} name="mentorId" render={({field})=><FormItem><FormLabel>@你的 Mentor<span aria-hidden="true" className="text-red-500"> *</span></FormLabel><FormControl><UserSelect accountType="apaas" valueType="string" multiple={false} value={field.value||null} onChange={value=>field.onChange(value||'')} placeholder="搜索并选择你的 Mentor" classNames={{trigger:'w-full rounded-2xl'}} /></FormControl><FormMessage/></FormItem>}/>
  <div><p className="mb-2 font-medium">人事</p><div className="rounded-2xl bg-[#f6f4f1] p-3"><UserDisplay value={[config.hrUserId]}/></div><p className="mt-2 text-xs text-[#8d8074]">后台固定人事 · 仅通知，无审批</p></div>
  </fieldset>
  {error&&<p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {result&&<p role="status" className="rounded-2xl bg-[#f4f4ed] p-3 text-sm">{result.message}<br/><span className="break-all text-xs text-[#8d8074]">登记编号：{key.current}</span></p>}
  <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={onClose} disabled={busy} className="rounded-full">{result?'完成':'取消'}</Button>{!result&&<Button type="submit" disabled={busy} className="rounded-full bg-gradient-to-r from-[#ff7952] to-[#ff5186] text-white">{busy?'正在登记与通知…':snapshot.current?'核对本次登记结果':'登记并通知'}</Button>}</div>
 </form></Form>;
}
export default function Calendar(){
 const frame=useRef<HTMLIFrameElement>(null),[documentText,setDocumentText]=useState(''),[frameReady,setFrameReady]=useState(false),[config,setConfig]=useState<CalendarConfig|null>(null),[configError,setConfigError]=useState(''),[kind,setKind]=useState<RegistrationKind|null>(null),[month,setMonth]=useState(today().slice(0,7)),[data,setData]=useState<CalendarData|null>(null),[dataError,setDataError]=useState(false),[weather,setWeather]=useState<WeatherData|null>(null),[revision,setRevision]=useState(0),[assetError,setAssetError]=useState(false),[formBusy,setFormBusy]=useState(false);
 const post=useCallback((message:Record<string,unknown>)=>frame.current?.contentWindow?.postMessage({duckCalendar:true,...message},location.origin),[]);
 useEffect(()=>{let active=true;axiosForBackend<unknown>({url:'/api/calendar/sprites',method:'GET'}).then(r=>r.data).then(sprite=>{if(active)setDocumentText(calendarDocument.replace('/*__DUCK_SPRITE_DATA__*/',JSON.stringify(sprite).replace(/</g,'\\u003c')));}).catch(()=>{if(active)setAssetError(true);});return()=>{active=false;};},[]);
 useEffect(()=>{let active=true;axiosForBackend<CalendarConfig>({url:'/api/calendar/config',method:'GET'}).then(r=>{if(active){setConfig(r.data);setConfigError('');}}).catch(()=>{if(active)setConfigError('固定人事配置读取失败，请稍后重试。');});return()=>{active=false;};},[revision]);
 useEffect(()=>{let active=true;setData(null);setDataError(false);axiosForBackend<CalendarData>({url:'/api/calendar/month',method:'GET',params:{month},timeout:120000}).then(r=>{if(active)setData(r.data);}).catch(()=>{if(active)setDataError(true);});return()=>{active=false;};},[month,revision]);
 useEffect(()=>{let active=true;const load=()=>{if(document.hidden)return;axiosForBackend<WeatherData>({url:'/api/calendar/weather',method:'GET',timeout:15000}).then(r=>{if(active)setWeather(r.data);}).catch(()=>{if(active)setWeather({available:false,scene:'overcast',windSpeed:0,windFrom:0,cloud:.9,validTime:'',updatedAt:'',source:'天气暂不可用'});});};load();const timer=setInterval(load,30*60000+Math.random()*60000);return()=>{active=false;clearInterval(timer);};},[]);
 useEffect(()=>{const refresh=()=>{if(!document.hidden)setRevision(r=>r+1);};const timer=setInterval(refresh,120000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[]);
 useEffect(()=>{const listener=(e:MessageEvent<unknown>)=>{if(e.source!==frame.current?.contentWindow||e.origin!==location.origin)return;const parsed=z.object({duckCalendar:z.literal(true),action:z.string(),kind:z.enum(['leave','late','early']).optional(),month:z.string().optional()}).safeParse(e.data);if(!parsed.success)return;const m=parsed.data;if(m.action==='ready')setFrameReady(true);if(m.action==='register'&&m.kind)setKind(m.kind);if(m.action==='refresh')setRevision(r=>r+1);if(m.action==='month'&&m.month&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(m.month))setMonth(m.month);};window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);},[]);
 useEffect(()=>{if(!frameReady)return;post(data?{action:'calendar',data,month}:dataError?{action:'error'}:{action:'loading',month});},[data,dataError,month,frameReady,post]);
 useEffect(()=>{if(frameReady&&weather)post({action:'weather',data:weather});},[frameReady,weather,post]);
 const description=useMemo(()=>kind==='leave'?'给自己一点休息时间':kind==='late'?'今天 10 点以后到达公司':'今天提前下班',[kind]);
 return <><div style={{height:'100dvh',width:'100%',background:'#e7edf4'}}>{documentText?<iframe ref={frame} title="鸭鸭日历" srcDoc={documentText} sandbox="allow-scripts allow-same-origin allow-popups" style={{border:0,width:'100%',height:'100%',display:'block'}}/>:<div className="flex h-full flex-col items-center justify-center gap-4"><h1 className="text-2xl font-bold">鸭鸭日历</h1><p>{assetError?'天气插画资源暂不可用，请重新加载。':'正在加载天气与鸭鸭…'}</p>{assetError&&<Button onClick={()=>location.reload()}>重新加载</Button>}</div>}</div>
 <Dialog open={!!kind} onOpenChange={open=>{if(!open&&!formBusy)setKind(null);}}><DialogContent className="max-h-[92dvh] overflow-y-auto rounded-[28px] border-white bg-white/95 p-6 sm:max-w-[490px]"><DialogHeader><DialogTitle className="text-2xl font-bold text-[#322d28]">{kind?title[kind]:''}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{kind&&config?<RegisterForm key={kind} kind={kind} config={config} onDone={()=>setRevision(r=>r+1)} onClose={()=>setKind(null)} onBusy={setFormBusy}/>:<p role="status">{configError||'正在读取后台人事配置…'}{configError&&<Button onClick={()=>setRevision(r=>r+1)} variant="outline" className="ml-3">重试</Button>}</p>}</DialogContent></Dialog></>;
}