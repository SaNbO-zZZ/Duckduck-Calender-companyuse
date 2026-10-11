import type { RegistrationResult } from './api.interface';
interface ProgressOptions {
 submit:()=>Promise<RegistrationResult>;
 read:()=>Promise<RegistrationResult|null>;
 onProgress:(result:RegistrationResult)=>void;
 signal:AbortSignal;
 intervalMs?:number;
 timeoutMs?:number;
}
export function trackRegistration(options:ProgressOptions):Promise<RegistrationResult> {
 return new Promise((resolve,reject)=>{
  let stopped=false,terminal=false,timer:ReturnType<typeof setTimeout>|undefined;
  const finish=(result?:RegistrationResult,error?:unknown)=>{
   if(stopped)return;stopped=true;if(timer)clearTimeout(timer);clearTimeout(deadline);
   options.signal.removeEventListener('abort',cancel);
   if(result)resolve(result);else reject(error);
  };
  const cancel=()=>finish(undefined,new Error('登记窗口已关闭。'));
  const deadline=setTimeout(()=>finish(undefined,new Error('登记结果仍在处理中，请核对本次登记结果，勿重复提交。')),options.timeoutMs??125000);
  const publish=(result:RegistrationResult)=>{
   if(stopped||terminal)return;
   options.onProgress(result);
   if(!result.processing){terminal=true;finish(result);}
  };
  const poll=async()=>{
   if(stopped)return;
   try{const result=await options.read();if(result)publish(result);}catch{
    // A progress read failure is not a registration failure. The original POST remains authoritative.
   }
   if(!stopped)timer=setTimeout(poll,options.intervalMs??1000);
  };
  options.signal.addEventListener('abort',cancel,{once:true});
  if(options.signal.aborted){cancel();return;}
  timer=setTimeout(poll,options.intervalMs??1000);
  // Always observe the POST even if the modal closes or polling sees completion before the Base mirror finishes.
  Promise.resolve().then(options.submit).then(publish).catch(error=>finish(undefined,error));
 });
}
