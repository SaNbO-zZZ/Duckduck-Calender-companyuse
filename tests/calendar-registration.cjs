const test = require('node:test');
const assert = require('node:assert/strict');
const { CalendarService } = require('../dist/server/modules/calendar/calendar.service');
const ids={actor:'1874391929959513',mentor:'1859345056942251',hr:'1859345056942250'};
function fixture(failHr=false){
 let row; const calls=[];
 const db={select:()=>({from:()=>({where:()=>({limit:async()=>row?[row]:[]})})}),insert:()=>({values:values=>({onConflictDoNothing:()=>({returning:async()=>{if(values.createdBy!==ids.actor||values.updatedBy!==ids.actor)throw Object.assign(new Error('new row violates row-level security policy'),{code:'42501'});row={id:'test-id',recordId:null,recordState:'creating',mentorState:'pending',hrState:'pending',...values};return[row];}})})}),update:()=>({set:patch=>({where:()=>{row={...row,...patch};const task=Promise.resolve([]);task.returning=async()=>[row];return task;}})})};
 const cap={load:id=>({call:async(action,input)=>{calls.push({id,action,input});if(action==='getRecord')return{id:'settings',record:{人事人员:[1859345056942250]}};if(action==='batchAddRecords')return{records:[{id:'recTest'}]};if(action==='batchUpdateRecords')return{};if(action==='send_feishu_message')return{success:!(failHr&&input.recipients[0]===ids.hr)};throw Error('Unexpected action');}})};
 const auth={listUsersByIds:async users=>users.map(id=>({miaodaUserID:id,name:{zh_cn:id===ids.actor?'登记员工':id===ids.hr?'Mia':'自选 Mentor'}})),getBatchLarkUserIds:async users=>users.map(()=> 'real-employee')};
 return{service:new CalendarService(cap,auth,db,{},{}),calls,getRow:()=>row};
}
const payload=()=>({requestKey:require('node:crypto').randomUUID(),kind:'leave',mentorId:ids.mentor,leaveType:'年假',start:'2026-10-11T09:00',end:'2026-10-11T18:00',arrivalTime:''});
test('a retry returns original registration and does not write/send twice',async()=>{const f=fixture(),p=payload();assert.equal((await f.service.submit(p,ids.actor)).notifications,'sent');assert.equal((await f.service.submit(p,ids.actor)).recordId,'recTest');assert.equal(f.calls.filter(c=>c.action==='batchAddRecords').length,1);assert.equal(f.calls.filter(c=>c.action==='send_feishu_message').length,2);const record=f.calls.find(c=>c.action==='batchAddRecords').input.records[0].record;assert.equal(record.事项,undefined);assert.equal(record.申请小时,undefined);assert.equal(record.交接说明,undefined);assert.deepEqual(record.申请人,[1874391929959513]);});
test('notification failure remains pending_review on retry',async()=>{const f=fixture(true),p=payload();const r=await f.service.submit(p,ids.actor);assert.equal(r.recorded,true);assert.equal(r.notifications,'pending_review');await f.service.submit(p,ids.actor);assert.equal(f.calls.filter(c=>c.action==='send_feishu_message').length,2);});
test('same key cannot switch applicant or payload',async()=>{const f=fixture(),p=payload();await f.service.submit(p,ids.actor);await assert.rejects(f.service.submit(p,ids.mentor),/其他员工/);await assert.rejects(f.service.submit({...p,leaveType:'病假'},ids.actor),/内容已更改/);});
test('invalid dates, forged actor/HR, unsafe numeric IDs are rejected',async()=>{for(const value of [{...payload(),start:'2026-02-30T09:00'},{...payload(),end:'2026-10-10T09:00'},{...payload(),applicant:ids.mentor},{...payload(),hrUserId:ids.mentor},{...payload(),mentorId:'9007199254740993'}]){const f=fixture();await assert.rejects(f.service.submit(value,ids.actor));assert.equal(f.calls.filter(c=>c.action==='batchAddRecords').length,0);}});
test('legacy late ETA defaults to today and must be after 10:00',async()=>{const f=fixture();await assert.rejects(f.service.submit({...payload(),kind:'late',leaveType:'',start:'',end:'',arrivalTime:'09:30'},ids.actor),/10:00/);assert.equal(f.calls.length,0);});
test('same mentor and HR receive only one notification',async()=>{const f=fixture();const result=await f.service.submit({...payload(),mentorId:ids.hr},ids.actor);assert.equal(result.notifications,'sent');assert.equal(f.calls.filter(c=>c.action==='send_feishu_message').length,1);});

test('audit ownership comes from the authenticated actor and is included in Drizzle SQL',async()=>{const f=fixture();await f.service.submit(payload(),ids.actor);assert.equal(f.getRow().createdBy,ids.actor);assert.equal(f.getRow().updatedBy,ids.actor);const {drizzle}=require('drizzle-orm/postgres-js');const {calendarSubmission}=require('../dist/server/database/schema');const query=drizzle({}).insert(calendarSubmission).values({...f.getRow(),id:undefined}).toSQL();assert.match(query.sql,/\"_created_by\"/);assert.match(query.sql,/\"_updated_by\"/);assert.equal(query.params.filter(v=>v===ids.actor).length,3);});

test('current absence uses exact instants within the day, including an arrival boundary',async(ctx)=>{const now=Date.parse('2026-10-10T13:00:00+08:00');let testNow=now;ctx.mock.method(Date,'now',()=>testNow);const cap={load:id=>({call:async(action)=>{if(action==='aggregateQuery')return {result:[],hasMore:false};if(id==='duck-holiday')return {records:[],hasMore:false};if(id==='duck-leave')return {records:[],hasMore:false};return {records:[['ended',now-3600000,now],['ongoing',now-3600000,now+3600000],['future',now+3600000,now+7200000]].map(([id,start,end])=>({id,record:{申请人:[1874391929959513],登记类型:'迟到',开始时间:start,结束时间:end}})),hasMore:false};}})};const auth={listUsersByIds:async users=>users.map(()=>({name:{zh_cn:'员工'}}))};const service=new CalendarService(cap,auth,{}, {},{});const data=await service.month('2026-10');assert.deepEqual(data.activeEvents.map(e=>e.id),['ongoing']);testNow=now+3600000;assert.deepEqual((await service.month('2026-10')).activeEvents.map(e=>e.id),['future']);});

test('transport read failures retry within a bound; other failures do not retry',async()=>{for(const [message,expected] of [['fetch failed',3],['permission denied',1]]){let calls=0;const cap={load:()=>({call:async()=>{calls++;throw Error(message);}})};const service=new CalendarService(cap,{}, {},{},{});await assert.rejects(service.config(),/暂时不可用/);assert.equal(calls,expected);}});
test('a transient read can recover and batch concurrency never exceeds two',async()=>{let calls=0;const cap={load:()=>({call:async()=>{if(++calls===1)throw Error('fetch failed');return{id:'settings',record:{人事人员:[1859345056942250]}};}})};const service=new CalendarService(cap,{}, {},{},{});assert.equal((await service.config()).hrUserId,ids.hr);let active=0,peak=0;const tasks=Array.from({length:7},(_,i)=>async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return i;});assert.deepEqual(await service.readBatch(tasks),[0,1,2,3,4,5,6]);assert.equal(peak,2);});

test('leave, later arrival and earlier departure preserve role names and exact notification recipients',async(ctx)=>{ctx.mock.method(Date,'now',()=>Date.parse('2026-10-10T11:00:00+08:00'));for(const kind of ['leave','late','early']){const f=fixture();await f.service.submit({...payload(),kind,...(kind==='leave'?{}:{leaveType:'',start:'',end:'',arrivalTime:kind==='late'?'11:30':''})},ids.actor);const sent=f.calls.filter(c=>c.action==='send_feishu_message');assert.deepEqual(sent.map(c=>c.input.recipients),[[ids.mentor],[ids.hr]]);assert.equal(sent[0].input.content,sent[1].input.content);for(const call of sent){assert.match(call.input.content,/Mentor：自选 Mentor\n人事：Mia/);assert.ok(call.input.content.includes(`<at ids="${ids.mentor},${ids.hr}">`));assert.doesNotMatch(call.input.content,/<person|<at id=/);assert.match(call.input.content,/仅通知，无审批/);assert.doesNotMatch(call.input.title,/迟到|早退/);}assert.equal(sent[0].input.title,'鸭鸭日历 · '+{leave:'请假知会',late:'晚到知会',early:'提前离开知会'}[kind]);const record=f.calls.find(c=>c.action==='batchAddRecords').input.records[0].record;assert.deepEqual(record.Mentor,[Number(ids.mentor)]);assert.deepEqual(record.人事,[Number(ids.hr)]);if(kind==='late'){assert.equal(record.登记类型,'晚到');assert.equal(record.开始时间,Date.parse('2026-10-10T10:00:00+08:00'));}if(kind==='early')assert.equal(record.登记类型,'提前离开');}});
test('business trip writes the new Base option and sends a trip notice',async()=>{const f=fixture(),p={...payload(),leaveType:'出差'};const r=await f.service.submit(p,ids.actor);assert.equal(r.recorded,true);const record=f.calls.find(c=>c.action==='batchAddRecords').input.records[0].record;assert.equal(record.类型,'出差');const sent=f.calls.filter(c=>c.action==='send_feishu_message');assert.equal(sent.length,2);assert.deepEqual(sent.map(c=>c.input.recipients),[[ids.mentor],[ids.hr]]);for(const call of sent){assert.equal(call.input.title,'鸭鸭日历 · 出差知会');assert.match(call.input.content,/类型：出差/);}});
test('profile ID mismatch prevents any record or notification',async()=>{const f=fixture();f.service.authn.listUsersByIds=async()=>[{miaodaUserID:'wrong',name:{zh_cn:'错误人员'}}];await assert.rejects(f.service.submit(payload(),ids.actor));assert.equal(f.calls.filter(c=>c.action==='batchAddRecords'||c.action==='send_feishu_message').length,0);});


test('unordered directory profiles cannot swap role names',async()=>{const f=fixture();const lookup=f.service.authn.listUsersByIds;f.service.authn.listUsersByIds=async users=>(await lookup(users)).reverse();await f.service.submit(payload(),ids.actor);for(const call of f.calls.filter(c=>c.action==='send_feishu_message')){assert.match(call.input.content,/申请人：登记员工/);assert.match(call.input.content,/Mentor：自选 Mentor\n人事：Mia/);}});


test('selected arrival date drives record interval and notification while submission time stays actual',async(ctx)=>{const now=Date.parse('2026-12-31T23:30:00+08:00');ctx.mock.method(Date,'now',()=>now);const f=fixture();const request={...payload(),kind:'late',leaveType:'',start:'',end:'',arrivalDate:'2027-01-01',arrivalTime:'10:30'};await f.service.submit(request,ids.actor);const r=f.calls.find(c=>c.action==='batchAddRecords').input.records[0].record;assert.equal(r.开始时间,Date.parse('2027-01-01T10:00:00+08:00'));assert.equal(r.结束时间,Date.parse('2027-01-01T10:30:00+08:00'));assert.equal(r.登记时间,now);const msg=f.calls.find(c=>c.action==='send_feishu_message').input.content;assert.match(msg,/预计到达：2027-01-01 10:30/);assert.match(msg,/登记时间：2026-12-31 23:30/);await f.service.submit(request,ids.actor);assert.equal(f.calls.filter(c=>c.action==='batchAddRecords').length,1);await assert.rejects(f.service.submit({...request,arrivalDate:'2027-01-02'},ids.actor),/内容已更改/);});
test('invalid arrival dates and already elapsed or pre-10 arrival instants fail before writes',async(ctx)=>{ctx.mock.method(Date,'now',()=>Date.parse('2026-10-11T15:35:00+08:00'));for(const [arrivalDate,arrivalTime] of [['2026-10-10','16:00'],['2026-10-11','15:35'],['2026-10-12','10:00'],['2026-02-30','11:00'],['','11:00']]){const f=fixture();await assert.rejects(f.service.submit({...payload(),kind:'late',leaveType:'',start:'',end:'',arrivalDate,arrivalTime},ids.actor));assert.equal(f.calls.filter(c=>c.action==='batchAddRecords'||c.action==='send_feishu_message').length,0);}});


function gate(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return {promise,resolve,reject};}
test('all three registration kinds send independently in parallel only after the record is saved',async(ctx)=>{
 ctx.mock.method(Date,'now',()=>Date.parse('2026-10-11T11:00:00+08:00'));
 for(const kind of ['leave','late','early']){
  const f=fixture(),original=f.service.capability.load;const write=gate(),both=gate(),finish=gate();let active=0;
  f.service.capability.load=id=>({call:async(action,input)=>{
   if(action==='batchAddRecords')await write.promise;
   if(action==='send_feishu_message'){assert.equal(f.getRow().recordState,'created');if(++active===2)both.resolve();await finish.promise;}
   return original(id).call(action,input);
  }});
  const request={...payload(),kind,...(kind==='late'?{arrivalDate:'2026-10-12',arrivalTime:'11:30'}:{})};
  const task=f.service.submit(request,ids.actor);
  await new Promise(r=>setImmediate(r));assert.equal(active,0);
  write.resolve();await both.promise;
  const progress=await f.service.status(request.requestKey,ids.actor);assert.equal(progress.recorded,true);assert.equal(progress.processing,true);assert.equal(progress.notifications,'sending');
  finish.resolve();assert.equal((await task).notifications,'sent');
 }
});
test('status reports sent before the slow Base notification mirror finishes without duplicate writes',async()=>{
 const f=fixture(),original=f.service.capability.load,mirror=gate(),started=gate();
 f.service.capability.load=id=>({call:async(action,input)=>{if(action==='batchUpdateRecords'){started.resolve();await mirror.promise;}return original(id).call(action,input);}});
 const p=payload(),task=f.service.submit(p,ids.actor);await started.promise;
 const status=await f.service.status(p.requestKey,ids.actor);assert.equal(status.processing,false);assert.equal(status.notifications,'sent');
 assert.equal((await f.service.submit(p,ids.actor)).notifications,'sent');assert.equal(f.calls.filter(c=>c.action==='send_feishu_message').length,2);
 mirror.resolve();await task;
});
test('status validates request ownership and stale work never claims sent',async(ctx)=>{
 const f=fixture();await assert.rejects(f.service.status('invalid',ids.actor));assert.equal(await f.service.status(require('node:crypto').randomUUID(),ids.actor),null);
 const p=payload();await f.service.submit(p,ids.actor);await assert.rejects(f.service.status(p.requestKey,ids.mentor),/其他员工/);
 const row=f.getRow();row.hrState='sending';ctx.mock.method(Date,'now',()=>row.submittedMs+120001);
 const stale=await f.service.status(p.requestKey,ids.actor);assert.equal(stale.notifications,'pending_review');assert.equal(stale.processing,false);
});
test('one rejected notification does not prevent the other recipient from receiving it',async()=>{
 const f=fixture(),original=f.service.capability.load;
 f.service.capability.load=id=>({call:async(action,input)=>{if(action==='send_feishu_message'&&input.recipients[0]===ids.mentor)throw Error('send unavailable');return original(id).call(action,input);}});
 const r=await f.service.submit(payload(),ids.actor);assert.equal(r.notifications,'pending_review');assert.equal(f.getRow().hrState,'sent');assert.equal(f.getRow().mentorState,'pending_review');
});
test('current-month refresh uses only three searches while preserving today and active boundaries',async(ctx)=>{
 const now=Date.parse('2026-10-11T12:00:00+08:00');ctx.mock.method(Date,'now',()=>now);let calls=0;
 const cap={load:id=>({call:async(action)=>{assert.equal(action,'searchRecords');calls++;
  if(id!=='duck-leave')return {records:[],hasMore:false};
  return {records:[['cross-month','2026-09-30T10:00','2026-10-12T18:00'],['past','2026-10-10T10:00','2026-10-10T18:00'],['ended','2026-10-11T10:00','2026-10-11T12:00'],['future','2026-10-11T15:00','2026-10-11T18:00']].map(([id,s,e],i)=>({id,record:{申请人:[i+1],类型:'年假',开始时间:Date.parse(s+':00+08:00'),结束时间:Date.parse(e+':00+08:00')}})),hasMore:false};
 }})};
 const auth={listUsersByIds:async ids=>ids.map(id=>({miaodaUserID:id,name:{zh_cn:'员工'}}))};
 const service=new CalendarService(cap,auth,{},{},{});const data=await service.month('2026-10');
 assert.equal(calls,3);assert.deepEqual(data.todayUserIds,['1','3','4']);assert.deepEqual(data.activeEvents.map(e=>e.id),['cross-month']);assert.equal(data.events.length,4);
 calls=0;await service.month('2026-09');assert.equal(calls,5);
});

const {trackRegistration}=require('../dist/shared/registration-progress');
const recorded={recorded:true,recordId:'rec',notifications:'sending',processing:true,message:'已登记'};
const sent={...recorded,notifications:'sent',processing:false,message:'已通知'};
test('progress returns persisted completion without waiting for mirror and does not abort the POST',async()=>{
 const post=gate(),updates=[];let reads=0,posts=0;const abort=new AbortController();
 const result=await trackRegistration({submit:()=>{posts++;return post.promise;},read:async()=>++reads===1?recorded:sent,onProgress:r=>updates.push(r),signal:abort.signal,intervalMs:1});
 assert.equal(result.notifications,'sent');assert.equal(posts,1);assert.deepEqual(updates.map(r=>r.notifications),['sending','sent']);
 post.resolve({...sent,notifications:'pending_review'});await new Promise(r=>setImmediate(r));assert.equal(updates.length,2);
});
test('progress failure cannot falsify submission failure or duplicate notifications',async()=>{
 let posts=0;const result=await trackRegistration({submit:async()=>{posts++;await new Promise(r=>setTimeout(r,10));return sent;},read:async()=>{throw Error('read unavailable');},onProgress:()=>{},signal:new AbortController().signal,intervalMs:1});assert.equal(result.notifications,'sent');assert.equal(posts,1);
});
test('closing a recorded form stops polling but keeps the original POST observed',async()=>{
 const post=gate(),abort=new AbortController();let reads=0;
 const task=trackRegistration({submit:()=>post.promise,read:async()=>{reads++;return recorded;},onProgress:()=>abort.abort(),signal:abort.signal,intervalMs:1});
 await assert.rejects(task,/窗口已关闭/);const n=reads;post.reject(Error('late network error'));await new Promise(r=>setTimeout(r,5));assert.equal(reads,n);
});
test('duplicate pending submission is monitored to completion and polling is bounded',async()=>{
 let reads=0;const r=await trackRegistration({submit:async()=>recorded,read:async()=>{reads++;return sent;},onProgress:()=>{},signal:new AbortController().signal,intervalMs:1});assert.equal(r.notifications,'sent');assert.equal(reads,1);
 await assert.rejects(trackRegistration({submit:async()=>recorded,read:async()=>recorded,onProgress:()=>{},signal:new AbortController().signal,intervalMs:1,timeoutMs:10}),/仍在处理中/);
});
