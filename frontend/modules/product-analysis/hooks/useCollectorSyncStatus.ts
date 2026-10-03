import {useEffect,useRef,useState} from 'react';
import {fetchCollectorSyncStatus,fetchCollectionRun,listCollectionRuns,type CollectorSyncStatus} from '../services/collectionApi';

/** Visibility-aware polling with one request at a time and shop-scoped late response guards. */
export function useCollectorSyncStatus(shopId:string,enabled:boolean,onImported?:()=>void) {
  const [state,setState]=useState<CollectorSyncStatus|null>(null);
  const [error,setError]=useState(false);
  const callback=useRef(onImported);callback.current=onImported;
  const counts=useRef<Record<string,number>>({});
  useEffect(()=>{
    setState(null);setError(false);
    if(!enabled)return;
    let live=true,inFlight=false,delay=30_000;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      if(!live||inFlight||document.visibilityState==='hidden')return;
      inFlight=true;
      try{
        const next=await fetchCollectorSyncStatus();
        if(!live)return;
        setState(next);setError(false);delay=next.active?4_000:30_000;
        if(shopId&&callback.current){
          try{
            // Covers automatic and manually submitted collection runs with the same refresh path.
            const runs=await listCollectionRuns(shopId);
            if(!live)return;
            const current=runs.find(run=>['ACTIVE','PAUSED','STARTING'].includes(run.status))||runs[0];
            if(current){
              const result=await fetchCollectionRun(shopId,current.id,1);
              if(!live)return;
              if(['ACTIVE','STARTING'].includes(result.run.status))delay=4_000;
              const count=result.batch?.counts.IMPORTED||0;
              const previous=counts.current[current.id]||0;
              counts.current[current.id]=count;
              if(count>previous)callback.current?.();
            }
          }catch{ /* Task-detail errors are shown in the collection window; credential sync state is still valid. */ }
        }
      }catch{if(live)setError(true);}
      finally{
        inFlight=false;
        if(live){clearTimeout(timer);timer=setTimeout(()=>void poll(),delay);}
      }
    };
    const visibility=()=>{
      clearTimeout(timer);
      if(document.visibilityState!=='hidden')void poll();
    };
    void poll();document.addEventListener('visibilitychange',visibility);
    return()=>{live=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visibility);};
  },[shopId,enabled]);
  return {state,error};
}
