window.__duckRuntime = true;
window.duckWeatherUnavailable = true;
(() => {
 let data=null, currentMonth='', hasError=false, transitionTimer=null;
 const runtimeOrigin=parent.location.origin;
 const day=ms=>new Date(ms+480*60000).toISOString().slice(0,10);
 const send=payload=>parent.postMessage({duckCalendar:true,...payload},runtimeOrigin);
 const colors={'年假':'#ff8a5c','调休':'#7c8cf0','出差':'#7c8cf0','事假':'#f2b84b','病假':'#4cb7a5','今天不想上班':'#ef6f9a','晚到':'#a399eb','提前离开':'#60b5cd'};
 const txt=(tag,value,className)=>{const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;};
 const person=(id,type)=>{const p=data?.people.find(p=>p.id===id),item=txt('div','','live-person');if(p?.avatar&&p.avatar.startsWith('https://')){const img=document.createElement('img');img.src=p.avatar;img.alt='';item.append(img);}else item.append(txt('span',(p?.name||'同事').slice(0,1),'initial'));item.append(txt('strong',p?.name||'帐号暂不可用'),txt('small',type));return item;};
 const classifyPresence=(events,now)=>{
  const rank={onWay:1,early:2,away:3},people=new Map();let nextTransition=Infinity;
  for(const e of events){
   if(e.start>now)nextTransition=Math.min(nextTransition,e.start);
   if(e.end>now)nextTransition=Math.min(nextTransition,e.end);
   if(e.start>now||e.end<=now)continue;
   const kind=e.type==='晚到'||e.type==='迟到'?'onWay':e.type==='提前离开'||e.type==='早退'?'early':'away';
   for(const id of e.userIds){const previous=people.get(id);if(!previous||rank[kind]>rank[previous.kind])people.set(id,{id,kind,event:e});}
  }
  const counts={onWay:0,away:0,early:0};for(const p of people.values())counts[p.kind]++;
  return {people:[...people.values()],counts,nextTransition};
 };
 window.duckClassifyPresence=classifyPresence;
 const countPhrase=n=>n===1?'一位':`${n} 位`;
 const hhmm=ms=>new Date(ms+480*60000).toISOString().slice(11,16);
 const summary=counts=>[
  counts.onWay?`有${countPhrase(counts.onWay)}同事正在赶来的路上 🦆💨`:'',
  counts.away?`有${countPhrase(counts.away)}同事此刻不在工位，鸭鸭替 TA 看着 ☕️`:'',
  counts.early?`有${countPhrase(counts.early)}同事先去拯救世界了 🌍`:'',
 ].filter(Boolean).join(' · ');
 window.duckRenderCalendar=(date,now)=>{
  const month=currentMonth||`${date.y}-${String(date.m).padStart(2,'0')}`,[y,m]=month.split('-').map(Number),cal=document.getElementById('calendar');if(!cal)return;
  cal.replaceChildren();document.getElementById('calendarMonth').textContent=`${y} 年 ${m} 月`;document.getElementById('calendarCaption').textContent='北京时间';
  for(const w of ['一','二','三','四','五','六','日'])cal.append(txt('div',w,'weekday'));
  const first=new Date(Date.UTC(y,m-1,1)),offset=(first.getUTCDay()+6)%7,count=Math.ceil((offset+new Date(Date.UTC(y,m,0)).getUTCDate())/7)*7;
  const today=day(Date.now());
  for(let i=0;i<count;i++){
   const date=new Date(Date.UTC(y,m-1,1-offset+i)),key=date.toISOString().slice(0,10),cell=txt('div',String(date.getUTCDate()),'date');cell.dataset.date=key;
   if(date.getUTCMonth()+1!==m)cell.classList.add('muted');if(key===today){cell.classList.add('today');cell.setAttribute('aria-current','date');}
   const holiday=data?.holidays.find(h=>h.date===key);if(holiday){cell.classList.add(holiday.type==='休'?'holiday':'work');cell.append(txt('span',holiday.type,'mark'));cell.title=holiday.name;}
   const start=Date.parse(key+'T00:00:00+08:00'),end=start+86400000,items=data?.events.filter(e=>e.start<end&&e.end>start)||[];
   for(const e of items.slice(0,3)) {const names=e.userIds.map(id=>data.people.find(p=>p.id===id)?.name||'同事').join('、'),chip=txt('div',names+' · '+e.type,'live-event');chip.style.borderLeftColor=colors[e.type]||'#8993a5';chip.title=names+' · '+e.type;cell.append(chip);}
   if(items.length>3)cell.append(txt('small',`另 ${items.length-3} 条`,'live-overflow'));
   cal.append(cell);
  }
 };
 const render=()=>{
  const now=Date.now(),n=new Date(now+480*60000),date={y:n.getUTCFullYear(),m:n.getUTCMonth()+1,d:n.getUTCDate()};window.duckRenderCalendar(date,date);
  if(transitionTimer){clearTimeout(transitionTimer);transitionTimer=null;}
  const presence=classifyPresence(data?.todayEvents||data?.activeEvents||[],now),{counts,people,nextTransition}=presence,total=people.length;
  if(Number.isFinite(nextTransition))transitionTimer=setTimeout(render,Math.max(0,nextTransition-now)+50);
  const headline=document.querySelector('.hero h1'),number=txt('span',data?String(total):'—','number');
  if(!data)headline.replaceChildren(txt('span',hasError?'日历暂不可用':'正在读取团队日历…'));
  else if(!total)headline.replaceChildren(txt('span','Alpha Pulse 一定会更大更强'));
  else headline.replaceChildren(document.createTextNode('此刻 '),number,document.createTextNode(counts.onWay===total?' 位同事正在路上':counts.away===total?' 位同事不在工位':counts.early===total?' 位同事先走一步':' 位同事有新动态'));
  document.querySelector('.subtitle').textContent=data?(total?summary(counts):'一切安好～'):(hasError?'日历数据暂不可用，请稍后重试':'正在读取团队日历…');
  const empty=document.querySelector('.empty');empty.replaceChildren();
  document.querySelector('.card h2').textContent='此刻的知会';
  if(data&&total){empty.classList.add('live-people');for(const p of people){const label=p.kind==='onWay'?`正在赶来 · 预计 ${hhmm(p.event.end)}`:p.kind==='early'?'先去拯救世界了':`${p.event.type} · 暂不在工位`;empty.append(person(p.id,label));}}
  else {empty.classList.remove('live-people');empty.append(txt('span','☕️'),txt('div',data?'Alpha Pulse 一定会更大更强':hasError?'数据暂不可用':'正在读取…'));}
  if(!data&&hasError){const retry=txt('button','重试','runtime-retry');retry.onclick=()=>send({action:'refresh'});empty.append(retry);}
 };
 document.addEventListener('click',e=>{const id=e.target.closest('button')?.id;const kind={leaveAction:'leave',lateAction:'late',earlyAction:'early'}[id];if(kind){e.preventDefault();e.stopImmediatePropagation();send({action:'register',kind});}},true);
 window.addEventListener('message',e=>{
  if(e.source!==parent||e.origin!==runtimeOrigin||!e.data?.duckCalendar)return;
  if(e.data.action==='calendar'){data=e.data.data;currentMonth=e.data.month;hasError=false;render();}
  if(e.data.action==='loading'){data=null;currentMonth=e.data.month;hasError=false;render();}
  if(e.data.action==='error'){data=null;hasError=true;render();}
  if(e.data.action==='sprites'&&window.duckInstallSprites)window.duckInstallSprites(e.data.data);
  if(e.data.action==='weather'){
   const weather=e.data.data;window.duckWeatherUnavailable=!weather.available;
   if(window.duckApplyForecast)window.duckApplyForecast(weather);
   document.getElementById('weatherIcon').title=weather.available?`${weather.source}\n数据更新时间 ${new Date(weather.validTime).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}\n阵风为视觉模拟。`:'天气读取失败，背景暂用中性静态画面。';
   if(!weather.available)document.getElementById('weatherIcon').textContent='🌫️ 天气暂不可用';
  }
 });
 document.addEventListener('DOMContentLoaded',()=>{
  document.body.classList.add('clean');document.querySelector('.note').innerHTML='日历登记只用于知会，不作考勤判断。鸭鸭是天气装饰，不代表具体同事。合肥天气数据来源：<a href="https://www.nmc.cn/publish/forecast/AAH/hefei.html" target="_blank" rel="noopener">中央气象台</a>；画面为艺术化演绎，阵风为视觉模拟。';
  const nav=txt('div','','runtime-month-nav');for(const [label,delta]of [['‹',-1],['今天',0],['›',1]]){const b=txt('button',label);b.type='button';b.setAttribute('aria-label',delta===-1?'上个月':delta===1?'下个月':'回到今天');b.onclick=()=>{const [y,m]=(currentMonth||day(Date.now()).slice(0,7)).split('-').map(Number),d=delta?new Date(Date.UTC(y,m-1+delta,1)):new Date(Date.now()+480*60000);send({action:'month',month:`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`});};nav.append(b);}document.querySelector('.month').append(nav);
  render();setInterval(()=>{if(!document.hidden)render();},30000);send({action:'ready'});
 });
})();