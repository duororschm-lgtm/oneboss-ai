'use client';
import { useEffect } from 'react';
/** Read-only polling; single in-flight request, terminal stop, hidden-tab slowdown. */
export function useTaskPolling(active: boolean | undefined, load: () => Promise<boolean | void>) {
 useEffect(()=>{
  if(!active)return;
  let stopped=false, failures=0, timer: ReturnType<typeof setTimeout>;
  const schedule=()=>{timer=setTimeout(tick,document.visibilityState==='hidden'?30000:Math.min(30000,3000*2**failures));};
  const tick=async()=>{
   try{const ok=await load();failures=ok===false?Math.min(4,failures+1):0;}catch{failures=Math.min(4,failures+1);}
   if(!stopped)schedule();
  };
  schedule(); return ()=>{stopped=true;clearTimeout(timer);};
 },[active,load]);
}
