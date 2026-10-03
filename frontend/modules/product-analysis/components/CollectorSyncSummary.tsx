import React from 'react';
import type {CollectorSyncStatus} from '../services/collectionApi';

const labels:Record<string,string>={PENDING:'等待补漏',RUNNING:'补漏中',WAITING:'等待现有采集任务',
  PAUSED:'等待继续',COMPLETED:'数据已齐全',FAILED:'补漏失败',CANCELLED:'补漏已取消',NEEDS_BINDING:'待绑定店铺',UNSUPPORTED:'站点暂不支持'};
export function formatPluginSyncTime(value:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}`;
}
export function CollectorSyncSummary({state,error=false,shopId,allShops=false}:{state:CollectorSyncStatus|null;error?:boolean;shopId?:string;allShops?:boolean}){
  const title=error?'同步状态读取失败':!state?'正在读取同步状态…':state.syncedToday?'今日已同步':
    state.lastPluginSyncedAt?`今日未同步 · 最近同步：${formatPluginSyncTime(state.lastPluginSyncedAt)}`:'尚未通过插件同步';
  const shops=allShops?state?.shops:state?.shops.filter(shop=>shop.shopId===shopId);
  return <div className="pa-sync-summary" role="status">
    <span className={`pa-sync-badge${state?.syncedToday&&!error?' pa-sync-badge-success':''}`}>{title}</span>
    {allShops&&state?.lastPluginSyncedAt&&<span className="pa-sync-detail">最近插件同步：{formatPluginSyncTime(state.lastPluginSyncedAt)}</span>}
    {shops?.map(shop=><div className="pa-sync-shop" key={shop.shopId}>
      <span>{allShops?`${shop.name} · `:''}{labels[shop.status]||shop.status} · {shop.completedDays}/30 天</span>
      {shop.detail&&<span className="pa-sync-detail">{shop.detail}</span>}
    </div>)}
  </div>;
}
