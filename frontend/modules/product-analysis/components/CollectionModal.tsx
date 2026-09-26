import React,{useCallback,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {ShopMeta} from '../types';
import {getApiErrorDetail} from '../services/productAnalysisApi';
import {actOnCollectionRun,bindCollectorShop,createCollectionRun,createSource,fetchBinding,fetchCollectionRun,
  listCollectionRuns,renewPairingCode,retryCollectionUpload,submitManualCookies,type BindingState,type CollectionRun,type RunDetail} from '../services/collectionApi';

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

export function CollectionModal({shop,onClose,onImported}:{shop:ShopMeta;onClose:()=>void;onImported:()=>void}){
  const defaults=defaultDates(shop.site);
  const [binding,setBinding]=useState<BindingState|null>(null);
  const [runs,setRuns]=useState<CollectionRun[]>([]);
  const [runId,setRunId]=useState('');
  const [detail,setDetail]=useState<RunDetail|null>(null);
  const [page,setPage]=useState(1);
  const [sourceId,setSourceId]=useState('');
  const [shopeeId,setShopeeId]=useState('');
  const [pairCode,setPairCode]=useState('');
  const [cookieJson,setCookieJson]=useState('');
  const [spcCds,setSpcCds]=useState('');
  const [from,setFrom]=useState(defaults.from),[to,setTo]=useState(defaults.to);
  const [recollect,setRecollect]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const importedCount=useRef(0);
  const refresh=useCallback(async()=>{
    const [b,r]=await Promise.all([fetchBinding(shop.id),listCollectionRuns(shop.id)]);
    setBinding(b);setRuns(r);
    setSourceId(current=>current||b.binding?.sourceId||b.sources[0]?.id||'');
    setShopeeId(current=>current||b.binding?.shopeeShopId||'');
    setRunId(current=>current||r[0]?.id||'');
  },[shop.id]);
  useEffect(()=>{void refresh().catch(e=>setError(getApiErrorDetail(e)));},[refresh]);
  useEffect(()=>{
    if(!runId)return;
    let mounted=true;
    const poll=async()=>{
      try{
        const data=await fetchCollectionRun(shop.id,runId,page);
        if(!mounted)return;
        setDetail(data);
        const count=data.batch?.counts.IMPORTED||0;
        if(count>importedCount.current){importedCount.current=count;onImported();}
      }catch(e){if(mounted)setError(getApiErrorDetail(e));}
    };
    void poll();const timer=window.setInterval(()=>void poll(),4000);
    return()=>{mounted=false;window.clearInterval(timer);};
  },[shop.id,runId,page,onImported]);
  const action=async(work:()=>Promise<unknown>)=>{
    setBusy(true);setError('');
    try{await work();await refresh();}catch(e){setError(getApiErrorDetail(e));}finally{setBusy(false);}
  };
  const syncBrowser=()=>{
    const connectionId=binding?.binding?.connectionId;
    if(!connectionId)return;
    const nonce=crypto.randomUUID();
    const timer=window.setTimeout(()=>{window.removeEventListener('message',onMessage);setError('未收到扩展响应，请确认已在扩展弹窗完成配对');},12000);
    const onMessage=(event:MessageEvent)=>{
      if(event.source!==window||event.origin!==location.origin||event.data?.type!=='SHOPEE_COLLECTOR_SYNC_RESULT'||
        event.data?.nonce!==nonce||event.data?.connectionId!==connectionId)return;
      window.clearTimeout(timer);window.removeEventListener('message',onMessage);
      if(!event.data.ok)setError(String(event.data.message));
      void refresh().catch(e=>setError(getApiErrorDetail(e)));
    };
    window.addEventListener('message',onMessage);
    window.postMessage({type:'SHOPEE_COLLECTOR_SYNC',nonce,connectionId},location.origin);
  };
  const status=binding?.connection?.credential.status;
  const statusText=status==='valid'?'登录有效':status==='pending'?'已同步，待真实请求验证':status==='invalid'?'登录失效':
    binding?.connection?.paired?'已配对，等待 Cookie':'未配对';
  const supported=shop.site in SITE_TZ;
  const maxTo=defaults.to;
  return <div className="pa-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="pa-collection-modal" role="dialog" aria-modal="true" aria-label="采集店铺数据">
      <header className="pa-collection-header"><div><strong>采集店铺数据</strong><div>{shop.name} · {shop.site} · {shop.currency}</div></div>
        <button type="button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
      {!supported?<p>此站点暂不支持采集，目前支持 PH、MY、SG。</p>:<>
        {error&&<p className="pa-collection-error" role="alert">{error}</p>}
        <div className="pa-collection-section">
          <strong>店铺与浏览器凭据</strong>
          {binding?.binding?<p>Shopee 店铺 ID：{binding.binding.shopeeShopId} · Cookie 来源：{binding.binding.sourceName} · {statusText}</p>:<>
            <label>Shopee 店铺 ID <input value={shopeeId} onChange={e=>setShopeeId(e.target.value)} placeholder="输入 Shopee 数字店铺 ID"/></label>
            <label>Cookie 来源 <select value={sourceId} onChange={e=>setSourceId(e.target.value)}>
              <option value="">选择来源</option>{binding?.sources.map(source=><option key={source.id} value={source.id}>{source.name}</option>)}
            </select></label>
            <button type="button" disabled={busy} onClick={()=>void action(async()=>{
              const created=await createSource(shop.id,`${shop.name} 浏览器`);setPairCode(created.pairingCode);setSourceId(created.sourceId);
            })}>创建浏览器连接与配对码</button>
            {pairCode&&<p>在扩展弹窗填写 ERP 页面地址、采集网关地址
              {import.meta.env.VITE_COLLECTOR_GATEWAY_URL?`（${import.meta.env.VITE_COLLECTOR_GATEWAY_URL}）`:''}和一次性配对码：
              <code>{pairCode}</code>（10 分钟有效）</p>}
            <button type="button" disabled={busy||!sourceId||!shopeeId} onClick={()=>void action(()=>bindCollectorShop(shop.id,sourceId,shopeeId))}>绑定当前 ERP 店铺</button>
          </>}
          {binding?.binding&&<><button type="button" onClick={syncBrowser}>同步当前浏览器 Cookie</button>
            <button type="button" disabled={busy} onClick={()=>void action(async()=>{
              const renewed=await renewPairingCode(shop.id,binding.binding!.sourceId);setPairCode(renewed.pairingCode);
            })}>重新生成扩展配对码</button>
            {pairCode&&<p>在扩展弹窗填写新配对码：<code>{pairCode}</code>（10 分钟有效）</p>}
            <details><summary>手动输入 Cookie-Editor JSON（备用）</summary>
              <textarea value={cookieJson} onChange={e=>setCookieJson(e.target.value)} placeholder="Cookie-Editor 导出的 JSON 数组"/>
              <label>SPC_CDS <input type="password" value={spcCds} onChange={e=>setSpcCds(e.target.value)}/></label>
              <button type="button" disabled={busy} onClick={()=>void action(async()=>{
                const parsed=JSON.parse(cookieJson);await submitManualCookies(shop.id,binding.binding!.sourceId,parsed,spcCds);
                setCookieJson('');setSpcCds('');
              })}>提交凭据</button>
            </details></>}
        </div>
        <div className="pa-collection-section"><strong>采集日期</strong>
          <div className="pa-collection-dates"><label>开始 <input type="date" max={maxTo} value={from} onChange={e=>setFrom(e.target.value)}/></label>
          <label>结束 <input type="date" max={maxTo} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
          <label><input type="checkbox" checked={recollect} onChange={e=>setRecollect(e.target.checked)}/> 重新采集已有日期</label>
          <button type="button" disabled={busy||!binding?.binding||!from||!to||from>to||to>maxTo}
            onClick={()=>void action(async()=>{const run=await createCollectionRun(shop.id,from,to,recollect,crypto.randomUUID());
              setRunId(run.id);setPage(1);importedCount.current=0;})}>开始采集</button>
        </div>
        <div className="pa-collection-section"><strong>任务进度</strong>
          {runs.length>0&&<select aria-label="选择采集任务" value={runId} onChange={e=>{setRunId(e.target.value);setPage(1);}}>
            {runs.map(run=><option key={run.id} value={run.id}>{run.fromDate.slice(0,10)} ~ {run.toDate.slice(0,10)} · {run.status}</option>)}</select>}
          {detail?.batch&&<><p>{Object.entries(detail.batch.counts).map(([key,count])=>`${labels[key]||key} ${count}`).join(' · ')}</p>
            <div className="pa-collection-actions">{(['pause','resume','cancel','retry'] as const).map(item=><button key={item} type="button" disabled={busy}
              onClick={()=>void action(()=>actOnCollectionRun(shop.id,runId,item))}>{({pause:'暂停',resume:'继续',cancel:'取消',retry:'重试失败日期'})[item]}</button>)}</div>
            <div className="pa-collection-task-list">{detail.tasks.map(task=><div key={`${task.report_date}-${task.id}`}>
              <span>{task.report_date}</span><span>{labels[task.status]||task.status}</span><span>{task.last_error||task.stage_detail||''}
                {['FAILED','SAVED'].includes(task.status)&&task.hasFile&&task.id!==null&&<button type="button" disabled={busy}
                  onClick={()=>void action(()=>retryCollectionUpload(shop.id,runId,task.id!))}>仅重试入库</button>}
              </span>
            </div>)}</div>
            <div className="pa-collection-pages"><button disabled={page<=1} onClick={()=>setPage(page-1)}>上一页</button>
              <span>{page} / {detail.pages||1}</span><button disabled={page>=detail.pages} onClick={()=>setPage(page+1)}>下一页</button></div>
          </>}
        </div>
      </>}
    </section>
  </div>;
}
