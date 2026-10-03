import React,{useCallback,useEffect,useRef,useState} from 'react';
import {X} from 'lucide-react';
import type {ShopMeta} from '../types';
import {getApiErrorDetail} from '../services/productAnalysisApi';
import {bindCollectorShop,createSource,fetchBinding,fetchSharedCredentials,submitSharedCookies,
  type BindingState,type CollectorSyncStatus,type SharedCredentialsState} from '../services/collectionApi';
import {CollectorSyncSummary} from './CollectorSyncSummary';
import {useModalDialog} from '../hooks/useModalDialog';

const shopIdKey=(id:string)=>`product-analysis:collector-shop-id:${id}`;
function remembered(id:string){try{return localStorage.getItem(shopIdKey(id))||'';}catch{return '';}}
function remember(id:string,value:string){try{if(value)localStorage.setItem(shopIdKey(id),value);else localStorage.removeItem(shopIdKey(id));}catch{}}

export function CollectorCredentialsModal({shop,syncState,onClose,onSaved,onDirtyChange}:{shop:ShopMeta;syncState:CollectorSyncStatus|null;
  onClose:()=>void;onSaved:()=>Promise<void>;onDirtyChange:(dirty:boolean)=>void}){
  const [binding,setBinding]=useState<BindingState|null>(null);
  const [sourceId,setSourceId]=useState('');
  const [shopeeId,setShopeeId]=useState(()=>remembered(shop.id));
  const [cookieJson,setCookieJson]=useState(''),[spcCds,setSpcCds]=useState('');
  const [manualOpen,setManualOpen]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [saved,setSaved]=useState(false),[retrySave,setRetrySave]=useState(0);
  const [status,setStatus]=useState<SharedCredentialsState['credential']['status']>('missing');
  const live=useRef(true),working=useRef(false),readVersion=useRef(0),draft=useRef(false),lastSaved=useRef(''),lastAttempt=useRef('');
  const section=useRef<HTMLElement>(null);
  useModalDialog(section,onClose);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  const refresh=useCallback(async()=>{
    const version=++readVersion.current;
    const [b,shared]=await Promise.all([fetchBinding(shop.id),fetchSharedCredentials()]);
    if(!live.current||version!==readVersion.current)return;
    setBinding(b);setStatus(shared.credential.status);
    if(!draft.current){
      const json=shared.cookies.length?JSON.stringify(shared.cookies):'';
      setCookieJson(json);setSpcCds(shared.spcCds);setSaved(Boolean(json&&shared.spcCds));
      lastSaved.current=json?JSON.stringify([shared.cookies,shared.spcCds.trim()]):'';
    }
    if(b.binding){setShopeeId(b.binding.shopeeShopId);remember(shop.id,b.binding.shopeeShopId);setSourceId(b.binding.sourceId);}
  },[shop.id]);
  useEffect(()=>{void refresh().catch(e=>{if(live.current)setError(getApiErrorDetail(e));});},[refresh,syncState?.lastPluginSyncedAt]);
  const action=useCallback(async(work:()=>Promise<void>)=>{
    if(working.current)return;
    working.current=true;setBusy(true);setError('');setNotice('');
    try{await work();if(live.current){await refresh();await onSaved();}}
    catch(e){if(live.current)setError(getApiErrorDetail(e));}
    finally{working.current=false;if(live.current)setBusy(false);}
  },[refresh,onSaved]);
  const saveBinding=useCallback(async()=>{
    const id=shopeeId.trim();
    if(!/^[0-9]{4,24}$/.test(id))throw new Error('请输入 4–24 位数字的 Shopee 店铺 ID');
    let target=binding?.binding?.sourceId||sourceId;
    if(!target){const created=await createSource(shop.id,`${shop.name} 手动 Cookie`);target=created.sourceId;if(live.current)setSourceId(target);}
    if(!binding?.binding)await bindCollectorShop(shop.id,target,id);
    remember(shop.id,id);
  },[shop.id,shop.name,shopeeId,sourceId,binding]);
  const saveCredentials=useCallback(()=>action(async()=>{
    let cookies:unknown;
    try{cookies=JSON.parse(cookieJson);}catch{throw new Error('Cookie JSON 格式错误，请粘贴 Cookie-Editor 导出的完整 JSON 数组');}
    if(!Array.isArray(cookies)||!cookies.length||cookies.length>300||cookies.some(c=>!c||typeof c!=='object'||typeof c.name!=='string'||!c.name.trim()||typeof c.value!=='string'))
      throw new Error('Cookie JSON 需要包含 1–300 条 Cookie，每条需有 name 和 value 字符串');
    const token=spcCds.trim();if(!token)throw new Error('请单独粘贴 SPC_CDS 的值');
    const payload=JSON.stringify([cookies,token]);
    if(payload!==lastSaved.current){await submitSharedCookies(cookies,token);lastSaved.current=payload;if(live.current)setStatus('pending');}
    if(live.current){setSaved(true);setNotice('采集凭据已自动保存，所有店铺共用；登录有效性将在采集时验证。');}
    if(shopeeId.trim())await saveBinding();
  }),[action,cookieJson,spcCds,shopeeId,saveBinding]);
  useEffect(()=>{
    if(!binding||busy||!manualOpen||!draft.current||!cookieJson.trim()||!spcCds.trim())return;
    const snapshot=JSON.stringify([shopeeId.trim(),cookieJson.trim(),spcCds.trim()]);
    if(lastAttempt.current===snapshot)return;
    setNotice('即将自动保存…');
    const timer=setTimeout(()=>{lastAttempt.current=snapshot;void saveCredentials();},800);
    return()=>clearTimeout(timer);
  },[binding,busy,manualOpen,cookieJson,spcCds,shopeeId,saveCredentials,retrySave]);
  useEffect(()=>{onDirtyChange(Boolean(cookieJson.trim()||spcCds.trim())&&!saved);},[cookieJson,spcCds,saved,onDirtyChange]);
  const changed=()=>{draft.current=true;lastAttempt.current='';setSaved(false);setNotice('');setError('');};
  const statusText=status==='valid'?'登录有效':status==='pending'?'已同步，待真实请求验证':status==='invalid'?'登录失效':'尚未保存采集凭据';
  return <div className="pa-modal-overlay pa-credentials-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section ref={section} tabIndex={-1} className="pa-collection-modal pa-credentials-modal" role="dialog" aria-modal="true" aria-label="凭据详情">
      <header className="pa-collection-header"><div><strong>凭据详情</strong><div>{shop.name} · {shop.site}</div></div>
        <button type="button" onClick={onClose} aria-label="关闭凭据详情"><X size={18}/></button></header>
      <CollectorSyncSummary state={syncState} allShops/>
      <div className="pa-collection-section"><strong>店铺与采集凭据</strong>
        <p>在浏览器插件中点击“开始同步”，即可更新所有店铺共用的 Cookie 和 SPC_CDS，并自动补齐近 30 天缺失数据。</p>
        {!binding&&<p>{error?'店铺配置读取失败，请重试。':'正在读取店铺配置…'}</p>}
        {error&&<p role="alert" className="pa-collection-error">{error}</p>}
        {!binding&&error&&<button type="button" onClick={()=>void action(async()=>{})}>重新读取店铺配置</button>}
        <label>Shopee 店铺 ID <input value={shopeeId} inputMode="numeric" autoComplete="off" readOnly={Boolean(binding?.binding)} disabled={busy||!binding}
          onChange={e=>{lastAttempt.current='';setError('');setNotice('');setShopeeId(e.target.value);remember(shop.id,e.target.value.trim());}} placeholder="输入 Shopee 数字店铺 ID"/></label>
        <p>{binding?.binding?'已绑定当前 ERP 店铺，切换店铺时自动回填对应 ID。':'店铺 ID 独立保存；绑定后即可使用插件同步的共用凭据。'}</p>
        {!binding?.binding&&<button type="button" disabled={busy||!binding||!shopeeId.trim()} onClick={()=>void action(async()=>{await saveBinding();if(live.current)setNotice('店铺绑定已保存');})}>保存店铺绑定</button>}
        <p role="status">{notice||statusText}</p>
        <button type="button" aria-expanded={manualOpen} onClick={()=>setManualOpen(open=>!open)}>手动输入凭据（备用）</button>
        {manualOpen&&<div className="pa-manual-credentials">
          <p>在 Shopee 卖家中心使用 Cookie-Editor 导出 JSON，并使用同一次登录的 SPC_CDS。填写完整后自动保存。</p>
          <label className="pa-collection-cookie-field">Cookie-Editor JSON <textarea value={cookieJson} disabled={busy||!binding} autoComplete="off" spellCheck={false}
            onChange={e=>{changed();setCookieJson(e.target.value);}} placeholder="粘贴 Cookie-Editor 导出的完整 JSON 数组"/></label>
          <label>SPC_CDS <input value={spcCds} disabled={busy||!binding} autoComplete="off" spellCheck={false}
            onChange={e=>{changed();setSpcCds(e.target.value);}} placeholder="单独粘贴 SPC_CDS 的值"/></label>
          <p>手动保存不计为插件今日同步。凭据只保存在服务端，店铺 ID 按店铺单独记忆。</p>
          {error&&binding&&cookieJson.trim()&&spcCds.trim()&&<button type="button" disabled={busy} onClick={()=>{lastAttempt.current='';setError('');setRetrySave(value=>value+1);}}>重试</button>}
        </div>}
      </div>
    </section>
  </div>;
}
