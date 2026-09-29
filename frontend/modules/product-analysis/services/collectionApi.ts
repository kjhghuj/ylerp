import api from '../../../src/api';

export interface CollectionSource {id:string;name:string;connectionId:string;createdAt:string}
export interface CollectionBinding {site:string;shopeeShopId:string;sourceId:string;connectionId:string;sourceName:string}
export interface ConnectionState {paired:boolean;lastSync:string|null;detail:string|null;
  credential:{status:'missing'|'pending'|'valid'|'invalid';last_validated_at:string|null;last_error:string|null}}
export interface BindingState {binding:CollectionBinding|null;sources:CollectionSource[];connection:ConnectionState|null}
export interface CollectionRun {id:string;shopId:string;fromDate:string;toDate:string;recollectExisting:boolean;
  status:string;collectorBatchId:number|null;createdAt:string}
export interface CollectionTask {id:number|null;report_date:string;status:string;stage_detail?:string|null;last_error?:string|null;hasFile?:boolean}
export interface RunDetail {run:CollectionRun;batch:{counts:Record<string,number>;total:number}|null;
  tasks:CollectionTask[];page:number;pages:number}

const path=(shopId:string)=>`/product-analysis/shops/${encodeURIComponent(shopId)}`;
export async function fetchBinding(shopId:string):Promise<BindingState>{
  return (await api.get<BindingState>(`${path(shopId)}/collector-binding`)).data;
}
export async function createSource(shopId:string,name:string):Promise<{sourceId:string;connectionId:string;pairingCode:string;expiresInSeconds:number}>{
  return (await api.post(`${path(shopId)}/credential-sources`,{name})).data;
}
export async function bindCollectorShop(shopId:string,sourceId:string,shopeeShopId:string):Promise<void>{
  await api.post(`${path(shopId)}/collector-binding`,{sourceId,shopeeShopId});
}
export async function submitManualCookies(shopId:string,sourceId:string,cookies:unknown,spcCds:string):Promise<void>{
  await api.post(`${path(shopId)}/credential-sources/${encodeURIComponent(sourceId)}/manual`,{cookies,spcCds});
}
export async function renewPairingCode(shopId:string,sourceId:string):Promise<{pairingCode:string;expiresInSeconds:number}>{
  return (await api.post(`${path(shopId)}/credential-sources/${encodeURIComponent(sourceId)}/pairing-code`)).data;
}
export async function listCollectionRuns(shopId:string):Promise<CollectionRun[]>{
  return (await api.get<CollectionRun[]>(`${path(shopId)}/collection-runs`)).data;
}
export async function createCollectionRun(shopId:string,from:string,to:string,recollectExisting:boolean,requestId:string):Promise<CollectionRun>{
  return (await api.post<CollectionRun>(`${path(shopId)}/collection-runs`,{from,to,recollectExisting,requestId})).data;
}
export async function fetchCollectionRun(shopId:string,runId:string,page:number):Promise<RunDetail>{
  return (await api.get<RunDetail>(`${path(shopId)}/collection-runs/${runId}`,{params:{page}})).data;
}
export async function actOnCollectionRun(shopId:string,runId:string,action:'pause'|'resume'|'cancel'|'retry'):Promise<void>{
  await api.post(`${path(shopId)}/collection-runs/${runId}/${action}`);
}
export async function retryCollectionUpload(shopId:string,runId:string,taskId:number):Promise<void>{
  await api.post(`${path(shopId)}/collection-runs/${runId}/tasks/${taskId}/retry-upload`);
}

export async function downloadCollectionReport(shopId:string,runId:string,taskId:number,reportDate:string):Promise<void>{
  const response=await api.get<Blob>(`${path(shopId)}/collection-runs/${runId}/tasks/${taskId}/download`,{responseType:'blob'});
  const url=URL.createObjectURL(response.data);
  const link=document.createElement('a');
  link.href=url;link.download=`shopee_${reportDate}.xlsx`;
  document.body.appendChild(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1_000);}
}
