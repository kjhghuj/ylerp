/** Local browser acceptance fixture: all API traffic stays in this synthetic adapter. */
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import api from '../../src/api';
import {CollectionModal} from '../../modules/product-analysis/components/CollectionModal';
import {CollectorSyncSummary} from '../../modules/product-analysis/components/CollectorSyncSummary';
import type {ShopMeta} from '../../modules/product-analysis/types';
import type {CollectorSyncStatus} from '../../modules/product-analysis/services/collectionApi';
import '../../modules/product-analysis/product-analysis.css';

const shops:ShopMeta[]=['PH','MY'].map((site,i)=>({id:`fixture-${i}`,name:`验收店铺 ${site}`,site:site as ShopMeta['site'],currency:i?'MYR':'PHP',
  platform:'shopee',dayCount:27,latestUploadDate:'2026-10-02',createdAt:'',updatedAt:''}));
const sync:CollectorSyncStatus={lastPluginSyncedAt:'2026-10-03T08:00:00Z',syncedToday:true,active:true,shops:shops.map(shop=>({
  shopId:shop.id,name:shop.name,site:shop.site,status:'RUNNING',from:'2026-09-03',to:'2026-10-02',completedDays:27,runId:'fixture-run',detail:'正在补齐 3 个缺失日期'}))};
let credentialReads=0;
let notify=()=>{};
api.defaults.adapter=async config=>{
  let data:unknown;
  if(config.url?.endsWith('/collector-sync-status'))data=sync;
  else if(config.url?.endsWith('/collector-credentials')){credentialReads++;notify();data={cookies:[{name:'SPC_ST',value:'synthetic-cookie',domain:'.seller.shopee.cn',path:'/'}],spcCds:'synthetic-cds',credential:{status:'pending'}};}
  else if(config.url?.endsWith('/collector-binding'))data={binding:{site:'PH',shopeeShopId:'12345678',sourceId:'fixture-source',connectionId:'fixture-connection',sourceName:'插件共用凭据'},sources:[],connection:{credential:{status:'pending'}}};
  else if(config.url?.endsWith('/collection-runs'))data=[];
  else throw new Error(`Unexpected fixture request: ${config.url}`);
  return {data,status:200,statusText:'OK',headers:{},config};
};
function Fixture(){
  const [shop,setShop]=useState(shops[0]),[open,setOpen]=useState(false),[,redraw]=useState(0);
  notify=()=>redraw(value=>value+1);
  return <main className="pa-shell" style={{padding:24,minHeight:'100vh','--text-primary':'#17212f','--text-secondary':'#64748b','--text-tertiary':'#6b7280','--pa-card':'#fff'} as React.CSSProperties}>
    <h1>商品分析 · 采集交互验收</h1><p>全部为测试数据；本页不请求真实店铺接口。</p>
    <div className="pa-toolbar"><select aria-label="验收店铺" value={shop.id} onChange={event=>setShop(shops.find(item=>item.id===event.target.value)!)}>
      {shops.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button type="button" onClick={()=>setOpen(true)}>采集店铺数据</button><CollectorSyncSummary state={sync}/></div>
    <p>完整凭据读取次数：<output aria-label="凭据读取次数">{credentialReads}</output></p>
    {open&&<CollectionModal shop={shop} syncState={sync} onClose={()=>setOpen(false)} onImported={()=>{}}/>}
  </main>;
}
const root=createRoot(document.getElementById('root')!);
root.render(<Fixture/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
