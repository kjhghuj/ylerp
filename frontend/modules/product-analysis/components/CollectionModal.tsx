import {createUuid} from '../../../src/uuid';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {ShopMeta} from '../types';
import {getApiErrorDetail} from '../services/productAnalysisApi';
import {actOnCollectionRun,createCollectionRun,downloadCollectionReport,fetchBinding,fetchCollectionRun,
  listCollectionRuns,retryCollectionUpload,type BindingState,type CollectionRun,type RunDetail,type CollectorSyncStatus} from '../services/collectionApi';
import {CollectorCredentialsModal} from './CollectorCredentialsModal';
import {CollectorSyncSummary} from './CollectorSyncSummary';
import {useCollectorSyncStatus} from '../hooks/useCollectorSyncStatus';
import {useModalDialog} from '../hooks/useModalDialog';

const SITE_TZ:Record<string,string>={PH:'Asia/Manila',MY:'Asia/Kuala_Lumpur',SG:'Asia/Singapore'};
function defaultDates(site:string){
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:SITE_TZ[site]||'UTC',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const yesterday=new Date(`${local}T00:00:00Z`);yesterday.setUTCDate(yesterday.getUTCDate()-1);
  const start=new Date(yesterday);start.setUTCDate(start.getUTCDate()-6);
  return {from:start.toISOString().slice(0,10),to:yesterday.toISOString().slice(0,10)};
}
const labels:Record<string,string>={PENDING:'等待采集',SUBMITTING:'提交导出',WAITING_GENERATION:'等待报表',DOWNLOADING:'下载中',
  DOWNLOADED:'下载完成',READY_TO_UPLOAD:'入库中',UPLOADING:'入库中',WAITING_IMPORT_CONFIRM:'入库中',
  UPLOADED_UNCONFIRMED:'入库待核实',IMPORTED:'已入库',SKIPPED:'已跳过',FAILED:'失败',WAITING_AUTH:'登录失效',
  PAUSED:'已暂停',SAVED:'下载完成，未入库',NEEDS_CONFIG:'配置缺失'};
type CollectionModalProps={shop:ShopMeta;onClose:()=>void;onImported:()=>void;syncState?:CollectorSyncStatus|null;syncError?:boolean};

export function CollectionModal(props:CollectionModalProps){return <CollectionModalContent key={props.shop.id} {...props}/>;}
function CollectionModalContent({shop,onClose,onImported,syncState,syncError}:CollectionModalProps){
  const defaults=defaultDates(shop.site);
  const [binding,setBinding]=useState<BindingState|null>(null);
  const [runs,setRuns]=useState<CollectionRun[]>([]),[runId,setRunId]=useState('');
  const [detail,setDetail]=useState<RunDetail|null>(null),[page,setPage]=useState(1);
  const [from,setFrom]=useState(defaults.from),[to,setTo]=useState(defaults.to);
  const [recollect,setRecollect]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [credentialsOpen,setCredentialsOpen]=useState(false),[credentialsDirty,setCredentialsDirty]=useState(false);
  const working=useRef(false),live=useRef(true),readVersion=useRef(0),importedCounts=useRef<Record<string,number>>({});
  const section=useRef<HTMLElement>(null);
  const ownSync=useCollectorSyncStatus(shop.id,syncState===undefined);
  const state=syncState===undefined?ownSync.state:syncState;
  useModalDialog(section,onClose,!credentialsOpen);
  useEffect(()=>{section.current?.toggleAttribute('inert',credentialsOpen);},[credentialsOpen]);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const refresh=useCallback(async()=>{
    const version=++readVersion.current;
    const [b,r]=await Promise.all([fetchBinding(shop.id),listCollectionRuns(shop.id)]);
    if(!live.current||version!==readVersion.current)return;
    setBinding(b);setRuns(r);setRunId(current=>current||r[0]?.id||'');
  },[shop.id]);
  useEffect(()=>{void refresh().catch(e=>{if(live.current)setError(getApiErrorDetail(e));});},[refresh]);
  useEffect(()=>{
    // New plugin-created runs must appear even if this window was already open.
    void refresh().catch(e=>{if(live.current)setError(getApiErrorDetail(e));});
  },[state,refresh]);
  useEffect(()=>{
    if(!runId)return;
    let mounted=true,polling=false,delay=4_000;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const poll=async()=>{
      if(polling||document.visibilityState==='hidden')return;
      polling=true;
      try{
        const data=await fetchCollectionRun(shop.id,runId,page);
        if(!mounted)return;
        setDetail(data);
        delay=['ACTIVE','STARTING'].includes(data.run.status)?4_000:30_000;
        const count=data.batch?.counts.IMPORTED||0;
        if(count>(importedCounts.current[runId]||0)){importedCounts.current[runId]=count;onImported();}
      }catch(e){if(mounted)setError(getApiErrorDetail(e));}
      finally{polling=false;}
    };
    const schedule=async()=>{
      if(!mounted||document.visibilityState==='hidden')return;
      await poll();
      if(mounted){clearTimeout(timer);timer=setTimeout(()=>void schedule(),delay);}
    };
    void schedule();
    const visible=()=>{clearTimeout(timer);if(document.visibilityState!=='hidden')void schedule();};
    document.addEventListener('visibilitychange',visible);
    return()=>{mounted=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visible);};
  },[shop.id,runId,page,onImported]);
  const action=useCallback(async(work:()=>Promise<unknown>)=>{
    if(working.current)return;
    working.current=true;setBusy(true);setError('');
    try{await work();await refresh();}catch(e){if(live.current)setError(getApiErrorDetail(e));}
    finally{working.current=false;if(live.current)setBusy(false);}
  },[refresh]);
  const status=binding?.connection?.credential.status||'missing';
  const supported=shop.platform==='shopee'&&shop.site in SITE_TZ;
  const closeCredentials=()=>{setCredentialsOpen(false);setCredentialsDirty(false);void refresh().catch(e=>{if(live.current)setError(getApiErrorDetail(e));});};
  return <>
    <div className="pa-modal-overlay" role="presentation" onMouseDown={e=>{if(!credentialsOpen&&e.target===e.currentTarget)onClose();}}>
      <section ref={section} tabIndex={-1} className="pa-collection-modal" role="dialog" aria-modal={!credentialsOpen} aria-label="采集店铺数据">
        <header className="pa-collection-header"><div><strong>采集店铺数据</strong><div>{shop.name} · {shop.site} · {shop.currency}</div></div>
          <button type="button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
        <div className="pa-collection-section">
          <CollectorSyncSummary state={state} error={syncError||ownSync.error} shopId={shop.id}/>
          <button type="button" onClick={()=>setCredentialsOpen(true)}>凭据详情</button>
          <p>插件同步后自动检查所有店铺近 30 天数据，已有日期跳过，今天不采集。</p>
          {!binding&&<p>{error?'店铺配置读取失败，请重试。':'正在读取店铺配置…'}</p>}
          {!binding&&error&&<button type="button" onClick={()=>void action(async()=>{})}>重新读取店铺配置</button>}
          {binding&&!binding.binding&&<p>请在“凭据详情”中绑定当前店铺。</p>}
          {status==='invalid'&&<p>登录失效，请在插件中重新同步凭据。</p>}
        </div>
        {error&&<p className="pa-collection-error" role="alert">{error}</p>}
        {!supported?<p>此站点暂不支持采集，目前支持 Shopee PH、MY、SG。</p>:<>
          <div className="pa-collection-section"><strong>采集日期</strong>
            <div className="pa-collection-dates"><label>开始 <input type="date" max={defaults.to} value={from} onChange={e=>setFrom(e.target.value)}/></label>
              <label>结束 <input type="date" max={defaults.to} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
            <label><input type="checkbox" checked={recollect} onChange={e=>setRecollect(e.target.checked)}/> 重新采集已有日期</label>
            <button type="button" disabled={busy||credentialsDirty||!binding?.binding||!['valid','pending'].includes(status)||!from||!to||from>to||to>defaults.to}
              onClick={()=>void action(async()=>{const run=await createCollectionRun(shop.id,from,to,recollect,createUuid());
                if(live.current){setRunId(run.id);setPage(1);setDetail(null);}})}>开始采集</button>
          </div>
          <div className="pa-collection-section"><strong>任务进度</strong>
            {runs.length>0&&<select aria-label="选择采集任务" value={runId} onChange={e=>{setDetail(null);setRunId(e.target.value);setPage(1);}}>
              {runs.map(run=><option key={run.id} value={run.id}>{run.fromDate.slice(0,10)} ~ {run.toDate.slice(0,10)} · {run.status}</option>)}</select>}
            {detail?.batch&&<><p>{Object.entries(detail.batch.counts).map(([key,count])=>`${labels[key]||key} ${count}`).join(' · ')}</p>
              <div className="pa-collection-actions">{(['pause','resume','cancel','retry'] as const).map(item=><button key={item} type="button" disabled={busy}
                onClick={()=>void action(()=>actOnCollectionRun(shop.id,runId,item))}>{({pause:'暂停',resume:'继续',cancel:'取消',retry:'重试失败日期'})[item]}</button>)}</div>
              <div className="pa-collection-task-list">{detail.tasks.map(task=><div key={`${task.report_date}-${task.id}`}>
                <span>{task.report_date}</span><span>{labels[task.status]||task.status}</span><span>{task.last_error||task.stage_detail||''}
                  {task.hasFile&&task.id!==null&&<button type="button" disabled={busy} onClick={()=>void action(()=>downloadCollectionReport(shop.id,runId,task.id!,task.report_date))}>下载原始报表</button>}
                  {['FAILED','SAVED'].includes(task.status)&&task.hasFile&&task.id!==null&&<button type="button" disabled={busy} onClick={()=>void action(()=>retryCollectionUpload(shop.id,runId,task.id!))}>仅重试入库</button>}
                </span>
              </div>)}</div>
              <div className="pa-collection-pages"><button disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</button>
                <span>{page} / {detail.pages||1}</span><button disabled={page>=detail.pages} onClick={()=>setPage(page+1)}>下一页</button></div>
            </>}
          </div>
        </>}
      </section>
    </div>
    {credentialsOpen&&<CollectorCredentialsModal key={shop.id} shop={shop} syncState={state} onClose={closeCredentials} onSaved={refresh} onDirtyChange={setCredentialsDirty}/>}
  </>;
}
