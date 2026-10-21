const fs=require('fs'),vm=require('vm'),assert=require('assert');
const html=fs.readFileSync('/Users/xz/Sanbo/Codex/Company/company_use_calendar/鸭鸭日历.html','utf8');
const js=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].find(x=>!x[1].includes('x-shader'))[2];new vm.Script(js);
const artCode=js.slice(js.indexOf('const DuckArt ='),js.indexOf('// ================= 0 结束'));
const sceneCode=js.slice(js.indexOf('const DUCK_DEFAULT_SEED ='),js.indexOf('// ================= 8.'));
let width=320,ctxLost=false,ctxNull=false,spriteNull=false;
const good={isContextLost:()=>ctxLost,putImageData(){},setTransform(){},clearRect(){},drawImage(){}};
const elems=new Map();
function el(tag='div') {const e={style:{},attrs:{},children:[],listeners:{},append(c){this.children.push(c)},setAttribute(k,v){this.attrs[k]=String(v)},getAttribute(k){return this.attrs[k]??null},addEventListener(k,cb){this.listeners[k]=cb},getContext(){return ctxNull||(spriteNull&&this!==elems.get('ducks'))?null:good},getBoundingClientRect(){return {left:16,top:170,width:width-32,height:300}}};return e;}
for(const id of ['ducks','duckDom','duckSeed']) elems.set(id,el(id==='ducks'?'canvas':'div'));
const hero=el();hero.parentElement=el();hero.parentElement.getBoundingClientRect=()=>({left:0,top:170,width,height:500});
const box={console,atob,btoa,performance,Uint8ClampedArray,Uint8Array,Int16Array,Uint32Array,DataView,Map,ImageData:class {constructor(data,w,h){Object.assign(this,{data,w,h})}},devicePixelRatio:1,scrollX:0,scrollY:0,getComputedStyle:()=>({borderTopLeftRadius:'28'}),small:{matches:true},document:{createElement:el,querySelector:()=>hero},$:(id)=>elems.get(id),clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),seededRandom:(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},cur:{rain:0,snow:0,windSigned:60},sim:{windSigned:60},sunTarget:{elev:40,az:180},sunNow:{daylight:1,warmth:0,twilight:0},WEATHERS:[{key:'clear'}],weatherIndex:0,isStill:()=>false,reviewPaused:false,geometryDirty:false,measureSurfaces(){},renderFx(){},updateStats(){},snowMeanOnHero:()=>0,duckSnowSpans:[]};
vm.createContext(box);vm.runInContext(artCode+sceneCode+`;globalThis.api={updateDucks,duckRefresh,duckDomMode,duckSprite,duckChoose,get layout(){return duckLayout},get slots(){return duckSlots},get list(){return duckList},get imgs(){return duckDomImgs},resetGeometry(){duckGeomDirty=true;duckLayoutKey=''},clearSprites(){duckSprites.clear()},get art(){return DuckArt}}`,box);
const api=box.api;let layouts=0;
for(width of [320,360,390,720,1440])for(const dpr of [1,2,3]) {
 box.devicePixelRatio=dpr;box.small.matches=width<=720;api.resetGeometry();api.updateDucks(0,false);
 const L=api.layout;assert.equal(L.place.length,9);assert(!L.squeezed);
 for(const row of L.rows)for(let i=1;i<row.length;i++) {
  const left=api.slots[row[i-1].i],right=api.slots[row[i].i];
  const gap=(row[i].cells-row[i-1].cells-Math.max(left.cur.half,left.cls==='W'?50:33)-Math.max(right.cur.half,right.cls==='W'?50:33))*L.cell;
  assert(gap>=6*L.cell-1e-8,'row overlap');
 }
 layouts++;
}
width=320;box.devicePixelRatio=1;box.small.matches=true;api.resetGeometry();
box.sim.windSigned=60;api.updateDucks(.1,true);const calm=api.list.map(x=>x.spr.key);
box.sim.windSigned=105;api.updateDucks(.1,true);const gust=api.list.map(x=>x.spr.key);assert.notDeepEqual(calm,gust);assert(calm.some(x=>x.includes('|0.75|')));assert(gust.some(x=>x.includes('|1|')));
ctxLost=true;elems.get('ducks').listeners.contextlost({preventDefault(){}});assert(api.duckDomMode());assert.equal(api.imgs.filter(x=>x.style.display!=='none').length,9);assert(api.list.every(x=>x.spr.url.startsWith('data:image/png;base64,')));
ctxLost=false;elems.get('ducks').listeners.contextrestored();assert(!api.duckDomMode());assert(api.list.every(x=>x.spr.cv));
spriteNull=true;api.clearSprites();box.sim.windSigned=-105;api.updateDucks(.1,true);assert(api.duckDomMode());assert.equal(api.imgs.filter(x=>x.style.display!=='none').length,9);
let artwork=0;
for(const a of api.art.ACTIONS)for(const fam of a.families)for(const phase of a.phases)for(const wind of [-1,0.75,1])for(const facing of [-1,1]) {
 const outfit=api.art.outfit(a.id,fam,phase,()=>.4),r=api.art.render({action:a.id,frame:0,outfit,family:fam,phase,wind,facing});assert(r.px.some(Boolean));artwork++;
}
console.log(JSON.stringify({js:'parse passed',layouts,viewports:'320/360/390/720/1440 × DPR 1/2/3',gust:'60km/h→0.75, 105km/h→1; distinct sprite keys',contextLoss:'9 PNG ducks remain; restored returns to Canvas',spriteCreationFailure:'9 PNG ducks remain',artwork},null,2));
