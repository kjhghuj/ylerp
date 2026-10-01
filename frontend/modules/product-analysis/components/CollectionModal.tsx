import React,{useCallback,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {ShopMeta} from '../types';
import {getApiErrorDetail} from '../services/productAnalysisApi';
import {actOnCollectionRun,bindCollectorShop,createCollectionRun,createSource,downloadCollectionReport,fetchBinding,fetchCollectionRun,
  listCollectionRuns,retryCollectionUpload,fetchSharedCredentials,submitSharedCookies,type BindingState,type CollectionRun,type RunDetail,type SharedCredentialsState} from '../services/collectionApi';

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

type CollectionModalProps={shop:ShopMeta;onClose:()=>void;onImported:()=>void};
const shopIdKey=(shopId:string)=>`product-analysis:collector-shop-id:${shopId}`;
function rememberedShopId(shopId:string){
  try{return localStorage.getItem(shopIdKey(shopId))||'';}catch{return '';}
}
function rememberShopId(shopId:string,value:string){
  try{
    if(value)localStorage.setItem(shopIdKey(shopId),value);
    else localStorage.removeItem(shopIdKey(shopId));
  }catch{ /* 浏览器禁止存储时仍可保存服务端绑定 */ }
}

export function CollectionModal(props:CollectionModalProps){
  // 店铺 ID 和任务状态独立挂载，凭据从账号的共用配置读取。
  return <CollectionModalContent key={props.shop.id} {...props}/>;
}

function CollectionModalContent({shop,onClose,onImported}:CollectionModalProps){
  const defaults=defaultDates(shop.site);
  const [binding,setBinding]=useState<BindingState|null>(null);
  const [runs,setRuns]=useState<CollectionRun[]>([]);
  const [runId,setRunId]=useState('');
  const [detail,setDetail]=useState<RunDetail|null>(null);
  const [page,setPage]=useState(1);
  const [sourceId,setSourceId]=useState('');
  const [shopeeId,setShopeeId]=useState(()=>rememberedShopId(shop.id));
  const [cookieJson,setCookieJson]=useState('');
  const [spcCds,setSpcCds]=useState('');
  const [from,setFrom]=useState(defaults.from),[to,setTo]=useState(defaults.to);
  const [recollect,setRecollect]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const [notice,setNotice]=useState('');
  const [retrySave,setRetrySave]=useState(0);
  const [sharedStatus,setSharedStatus]=useState<SharedCredentialsState['credential']['status']>('missing');
  const sharedDraft=useRef(false);
  const lastSavedPayload=useRef('');
  const lastSaveAttempt=useRef('');
  const working=useRef(false);
  const importedCount=useRef(0);
  const refresh=useCallback(async()=>{
    const [b,r,shared]=await Promise.all([fetchBinding(shop.id),listCollectionRuns(shop.id),fetchSharedCredentials()]);
    setBinding(b);setRuns(r);
    setSharedStatus(shared.credential.status);
    if(!sharedDraft.current){
      const json=shared.cookies.length?JSON.stringify(shared.cookies):'';
      setCookieJson(json);setSpcCds(shared.spcCds);
      setSaved(Boolean(json&&shared.spcCds));
      lastSavedPayload.current=json?JSON.stringify([shared.cookies,shared.spcCds.trim()]):'';
      if(b.binding&&json)lastSaveAttempt.current=JSON.stringify([b.binding.shopeeShopId,json,shared.spcCds.trim()]);
    }
    setSourceId(current=>b.binding?.sourceId||current);
    if(b.binding){
      setShopeeId(b.binding.shopeeShopId);
      rememberShopId(shop.id,b.binding.shopeeShopId);
    }
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
  const action=useCallback(async(work:()=>Promise<unknown>)=>{
    if(working.current)return;
    working.current=true;setBusy(true);setError('');setNotice('');
    try{await work();await refresh();}catch(e){
      // 绑定可能已成功而凭据提交失败，重新读取绑定，重试时复用同一来源。
      try{await refresh();}catch{ /* 保留原操作的错误 */ }
      setNotice('');setError(getApiErrorDetail(e));
    }finally{working.current=false;setBusy(false);}
  },[refresh]);
  const saveCredentials=useCallback(()=>action(async()=>{
    setNotice('正在自动保存采集凭据…');
    const id=shopeeId.trim();
    if(id&&!/^[0-9]{4,24}$/.test(id))throw new Error('请输入 4–24 位数字的 Shopee 店铺 ID');
    let cookies:unknown;
    try{cookies=JSON.parse(cookieJson);}catch{throw new Error('Cookie JSON 格式错误，请粘贴 Cookie-Editor 导出的完整 JSON 数组');}
    if(!Array.isArray(cookies)||cookies.length===0||cookies.length>300||cookies.some(cookie=>
      !cookie||typeof cookie!=='object'||typeof cookie.name!=='string'||!cookie.name.trim()||typeof cookie.value!=='string'))
      throw new Error('Cookie JSON 需要包含 1–300 条 Cookie，每条需有 name 和 value 字符串');
    const token=spcCds.trim();
    if(!token)throw new Error('请单独粘贴 SPC_CDS 的值');
    const payload=JSON.stringify([cookies,token]);
    if(lastSavedPayload.current!==payload){
      await submitSharedCookies(cookies,token);
      lastSavedPayload.current=payload;setSharedStatus('pending');
    }
    setSaved(true);
    setNotice('采集凭据已自动保存，所有店铺共用；登录有效性将在采集时验证。');
    if(!id)return;
    let targetSource=binding?.binding?.sourceId||sourceId;
    if(!targetSource){
      const created=await createSource(shop.id,`${shop.name} 手动 Cookie`);
      targetSource=created.sourceId;setSourceId(targetSource);
    }
    if(!binding?.binding)await bindCollectorShop(shop.id,targetSource,id);
    rememberShopId(shop.id,id);
  }),[action,shop.id,shop.name,shopeeId,cookieJson,spcCds,binding?.binding,sourceId]);
  useEffect(()=>{
    if(!binding||busy||!cookieJson.trim()||!spcCds.trim())return;
    const snapshot=JSON.stringify([shopeeId.trim(),cookieJson.trim(),spcCds.trim()]);
    if(lastSaveAttempt.current===snapshot)return;
    setNotice('即将自动保存…');
    const timer=window.setTimeout(()=>{
      // 状态刷新和失败重绘不应重复提交同一份凭据。
      lastSaveAttempt.current=snapshot;
      void saveCredentials();
    },800);
    return()=>window.clearTimeout(timer);
  },[binding,busy,shopeeId,cookieJson,spcCds,saveCredentials,retrySave]);
  const credentialsChanged=()=>{
    sharedDraft.current=true;
    lastSaveAttempt.current='';setSaved(false);setNotice('');setError('');
  };
  const credentialsDirty=Boolean(cookieJson.trim()||spcCds.trim())&&!saved;
  const status=sharedStatus;
  const statusText=status==='valid'?'登录有效':status==='pending'?'已同步，待真实请求验证':status==='invalid'?'登录失效':
    saved?'已保存，待真实请求验证':'请粘贴采集凭据';
  const supported=shop.site in SITE_TZ;
  const maxTo=defaults.to;
  return <div className="pa-modal-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="pa-collection-modal" role="dialog" aria-modal="true" aria-label="采集店铺数据">
      <header className="pa-collection-header"><div><strong>采集店铺数据</strong><div>{shop.name} · {shop.site} · {shop.currency}</div></div>
        <button type="button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
      {!supported?<p>此站点暂不支持采集，目前支持 PH、MY、SG。</p>:<>
        {error&&<p className="pa-collection-error" role="alert">{error}</p>}
        <div className="pa-collection-section">
          <strong>店铺与采集凭据</strong>
          <p>Cookie 来源：手动粘贴 Cookie-Editor JSON</p>
          <p>在当前浏览器登录 Shopee 卖家中心，打开 Cookie-Editor，选择导出 → JSON，再粘贴到下方。Cookie 和 SPC_CDS 由所有店铺共用。</p>
          {!binding&&<p>{error?'店铺配置读取失败，请重试。':'正在读取店铺配置…'}</p>}
          {!binding&&error&&<button type="button" disabled={busy} onClick={()=>void action(async()=>{})}>重新读取店铺配置</button>}
          <label>Shopee 店铺 ID <input value={shopeeId} inputMode="numeric" autoComplete="off"
            readOnly={Boolean(binding?.binding)} disabled={busy||!binding}
            onChange={e=>{lastSaveAttempt.current='';setNotice('');setError('');setShopeeId(e.target.value);rememberShopId(shop.id,e.target.value.trim());}}
            placeholder="输入 Shopee 数字店铺 ID"/></label>
          <p>{binding?.binding?'已绑定当前 ERP 店铺，切换店铺时自动回填对应 ID。':'ID 按当前 ERP 店铺自动记忆；首次保存凭据时完成绑定，请确认 ID 正确。'}</p>
          <label className="pa-collection-cookie-field">Cookie-Editor JSON
            <textarea value={cookieJson} disabled={busy||!binding} autoComplete="off" spellCheck={false}
              onChange={e=>{credentialsChanged();setCookieJson(e.target.value);}} placeholder="粘贴 Cookie-Editor 导出的完整 JSON 数组"/>
          </label>
          <label>SPC_CDS <input type="text" value={spcCds} disabled={busy||!binding} autoComplete="off" spellCheck={false}
            onChange={e=>{credentialsChanged();setSpcCds(e.target.value);}} placeholder="单独粘贴 SPC_CDS 的值"/></label>
          <p>请使用同一次登录的 Cookie 和 SPC_CDS。填写完整后自动保存，更新后对所有店铺生效；关闭弹窗或切换店铺后自动回填。Shopee 店铺 ID 仍按店铺单独保存。</p>
          {error&&binding&&cookieJson.trim()&&spcCds.trim()&&
            <button type="button" disabled={busy} onClick={()=>{
              lastSaveAttempt.current='';setError('');setRetrySave(value=>value+1);
            }}>重试</button>}
          <p role="status">{notice||statusText}</p>
        </div>
        <div className="pa-collection-section"><strong>采集日期</strong>
          <div className="pa-collection-dates"><label>开始 <input type="date" max={maxTo} value={from} onChange={e=>setFrom(e.target.value)}/></label>
          <label>结束 <input type="date" max={maxTo} value={to} onChange={e=>setTo(e.target.value)}/></label></div>
          <label><input type="checkbox" checked={recollect} onChange={e=>setRecollect(e.target.checked)}/> 重新采集已有日期</label>
          <button type="button" disabled={busy||credentialsDirty||!binding?.binding||status==='invalid'||(!saved&&status!=='valid'&&status!=='pending')||!from||!to||from>to||to>maxTo}
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
                {task.hasFile&&task.id!==null&&<button type="button" disabled={busy}
                  onClick={()=>void action(()=>downloadCollectionReport(shop.id,runId,task.id!,task.report_date))}>下载原始报表</button>}
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
