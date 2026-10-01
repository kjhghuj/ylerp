import {randomUUID} from 'node:crypto';
import {Router, type Request, type Response} from 'express';
import {prisma} from '../index';
import {collectorRequest,collectorReportFile} from '../services/productAnalysisCollectorClient';
import {isValidCalendarDate} from '../services/productAnalysisUpload';
import {CredentialInputError} from '../collector/credentials';

const router=Router();
const SUPPORTED=new Set(['PH','MY','SG']);
const TIMEZONE:Record<string,string>={PH:'Asia/Manila',MY:'Asia/Kuala_Lumpur',SG:'Asia/Singapore'};
const activeStatuses=['STARTING','ACTIVE','PAUSED'];

async function allowed(req:Request,res:Response):Promise<boolean> {
  const user=req.user;
  if(!user){res.status(401).json({detail:'Unauthorized'});return false;}
  if(user.role==='owner')return true;
  const current=await prisma.user.findUnique({where:{id:user.id},select:{permissions:true,isActive:true}});
  const p=current?.permissions||[];
  if(current?.isActive&&(p.includes('*')||p.includes('product-analysis')||p.includes('product-analysis.upload'))) return true;
  res.status(403).json({detail:'Forbidden'});return false;
}
async function shopFor(req:Request) {
  return prisma.productAnalysisShop.findFirst({where:{id:String(req.params.id||''),userId:req.user!.id}});
}
function yesterday(site:string):string {
  const local=new Intl.DateTimeFormat('en-CA',{timeZone:TIMEZONE[site],year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const d=new Date(`${local}T00:00:00Z`); d.setUTCDate(d.getUTCDate()-1);
  return d.toISOString().slice(0,10);
}
function range(input:Record<string,unknown>,site:string):{from:string;to:string}|null {
  const from=input.from,to=input.to;
  if(typeof from!=='string'||typeof to!=='string'||!isValidCalendarDate(from)||!isValidCalendarDate(to)||from>to||to>yesterday(site)) return null;
  const days=(Date.parse(to)-Date.parse(from))/86400000+1;
  return days<=366?{from,to}:null;
}
function safeError(res:Response,error:unknown) {
  if(error instanceof CredentialInputError)return res.status(400).json({detail:error.message});
  console.error('Collection error:',error instanceof Error?error.message:String(error));
  const code=error && typeof error==='object' && 'code' in error ? String(error.code) : '';
  const remoteStatus=error && typeof error==='object' && 'status' in error ? Number(error.status) : 0;
  const status=code==='P2002'||remoteStatus===400||remoteStatus===409?409:502;
  return res.status(status).json({detail:error instanceof Error?error.message:'采集服务不可用'});
}
async function sharedCredentialScope(req:Request) {
  const sources=await prisma.productAnalysisCredentialSource.findMany({where:{userId:req.user!.id},select:{accountKey:true}});
  return {scopeKey:`erp-user:${req.user!.id}`,accountKeys:sources.map(source=>source.accountKey)};
}
function validCredentials(body:Record<string,unknown>|undefined):boolean {
  return Array.isArray(body?.cookies)&&body.cookies.length>0&&body.cookies.length<=300&&
    body.cookies.every((cookie:unknown)=>cookie&&typeof cookie==='object'&&
      'name' in cookie&&typeof cookie.name==='string'&&Boolean(cookie.name.trim())&&
      'value' in cookie&&typeof cookie.value==='string')&&
    typeof body.spcCds==='string'&&Boolean(body.spcCds.trim());
}

router.get('/collector-credentials',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  res.setHeader('Cache-Control','private, no-store');
  try {return res.json(await collectorRequest('/api/erp/shared-credentials',{body:await sharedCredentialScope(req)}));}
  catch(error){return safeError(res,error);}
});
router.post('/collector-credentials',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  if(!validCredentials(req.body))return res.status(400).json({detail:'Cookie-Editor JSON 或 SPC_CDS 无效'});
  res.setHeader('Cache-Control','private, no-store');
  try {
    const result=await collectorRequest<{credential:unknown}>('/api/erp/shared-credentials',{
      method:'POST',body:{...await sharedCredentialScope(req),cookies:req.body.cookies,spcCds:req.body.spcCds.trim()}});
    return res.json({ok:true,syncedAt:new Date().toISOString(),credential:result.credential});
  }catch(error){return safeError(res,error);}
});
async function syncRunStatus(run:{id:string;status:string;collectorBatchId:number|null}) {
  if(!run.collectorBatchId)return run.status;
  const data=await collectorRequest<{batch:{counts:Record<string,number>;total:number}}>(`/api/erp/batches/${run.collectorBatchId}`);
  const c=data.batch.counts;
  const done=(c.IMPORTED||0)+(c.SKIPPED||0)===data.batch.total;
  const working=Object.entries(c).some(([key,value])=>value>0&&!['IMPORTED','SKIPPED','FAILED'].includes(key));
  const status=done?'COMPLETED':!working&&c.FAILED?'FAILED':run.status;
  if(status!==run.status)await prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{status}});
  return status;
}
async function recoverStarting(run:{id:string;status:string;collectorBatchId:number|null;createdAt:Date}) {
  if(run.status!=='STARTING'||run.collectorBatchId)return run;
  try {
    const found=await collectorRequest<{batchId:number}>(`/api/erp/batches/by-run/${run.id}`);
    return prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{collectorBatchId:found.batchId,status:'ACTIVE'}});
  }catch(error){
    const status=error&&typeof error==='object'&&'status'in error?Number(error.status):0;
    if(status!==404||Date.now()-run.createdAt.getTime()<60_000)throw error;
    return prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{status:'FAILED'}});
  }
}

router.get('/shops/:id/collector-binding',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  const binding=await prisma.productAnalysisCollectorBinding.findUnique({where:{shopId:shop.id},include:{source:true}});
  const sources=await prisma.productAnalysisCredentialSource.findMany({where:{userId:req.user!.id},select:{id:true,name:true,connectionId:true,createdAt:true}});
  let connection=null;
  if(binding) {
    try {connection=await collectorRequest(`/api/erp/connections/${encodeURIComponent(binding.source.connectionId)}`);} catch { /* 状态不可用时仍展示绑定 */ }
  }
  return res.json({binding:binding?{site:binding.site,shopeeShopId:binding.shopeeShopId,sourceId:binding.sourceId,
    connectionId:binding.source.connectionId,sourceName:binding.source.name}:null,sources,connection});
});

router.post('/shops/:id/credential-sources',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  if(!SUPPORTED.has(shop.site))return res.status(400).json({detail:'此站点暂不支持采集'});
  const name=String(req.body?.name||`${shop.name} 浏览器`).trim().slice(0,80);
  const id=randomUUID(),accountKey=`erp-${id}`;
  try {
    const created=await collectorRequest<{connectionId:string;pairingCode:string;expiresInSeconds:number}>('/api/erp/connections',
      {method:'POST',body:{accountKey,name,credentialScopeKey:`erp-user:${req.user!.id}`}});
    const source=await prisma.productAnalysisCredentialSource.create({data:{id,userId:req.user!.id,
      connectionId:created.connectionId,accountKey,name}});
    return res.status(201).json({sourceId:source.id,connectionId:created.connectionId,
      pairingCode:created.pairingCode,expiresInSeconds:created.expiresInSeconds});
  } catch(error){return safeError(res,error);}
});

router.post('/shops/:id/collector-binding',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  if(!SUPPORTED.has(shop.site))return res.status(400).json({detail:'此站点暂不支持采集'});
  const shopeeShopId=String(req.body?.shopeeShopId||'').trim();
  if(!/^[0-9]{4,24}$/.test(shopeeShopId))return res.status(400).json({detail:'Shopee 店铺 ID 格式无效'});
  const source=await prisma.productAnalysisCredentialSource.findFirst({where:{id:String(req.body?.sourceId||''),userId:req.user!.id}});
  if(!source)return res.status(404).json({detail:'Credential source not found'});
  const prior=await prisma.productAnalysisCollectorBinding.findUnique({where:{shopId:shop.id}});
  if(prior && (prior.shopeeShopId!==shopeeShopId||prior.sourceId!==source.id)) return res.status(409).json({detail:'店铺已绑定，请先处理原绑定'});
  try {
    await collectorRequest('/api/erp/bind-shop',{method:'POST',body:{site:shop.site,shopId:shopeeShopId,
      connectionId:source.connectionId,name:shop.name}});
    const binding=await prisma.productAnalysisCollectorBinding.upsert({where:{shopId:shop.id},
      create:{shopId:shop.id,userId:req.user!.id,sourceId:source.id,site:shop.site,shopeeShopId},update:{}});
    return res.json({site:binding.site,shopeeShopId:binding.shopeeShopId,sourceId:binding.sourceId});
  } catch(error){return safeError(res,error);}
});

router.post('/shops/:id/credential-sources/:sourceId/manual',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  const source=await prisma.productAnalysisCredentialSource.findFirst({where:{id:String(req.params.sourceId),userId:req.user!.id}});
  if(!source)return res.status(404).json({detail:'Credential source not found'});
  if(!validCredentials(req.body))
    return res.status(400).json({detail:'Cookie-Editor JSON 或 SPC_CDS 无效'});
  try {
    const result=await collectorRequest<{credential:unknown}>('/api/erp/shared-credentials',
      {method:'POST',body:{...await sharedCredentialScope(req),cookies:req.body.cookies,spcCds:req.body.spcCds.trim()}});
    return res.json({ok:true,credential:result.credential});
  }
  catch(error){return safeError(res,error);}
});

router.post('/shops/:id/credential-sources/:sourceId/pairing-code',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  const source=await prisma.productAnalysisCredentialSource.findFirst({where:{id:String(req.params.sourceId),userId:req.user!.id}});
  if(!source)return res.status(404).json({detail:'Credential source not found'});
  try{return res.json(await collectorRequest(`/api/erp/connections/${source.connectionId}/pairing-code`,{method:'POST'}));}
  catch(error){return safeError(res,error);}
});

router.post('/shops/:id/collection-runs',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  if(!SUPPORTED.has(shop.site))return res.status(400).json({detail:'此站点暂不支持采集'});
  const dates=range(req.body||{},shop.site);
  if(!dates)return res.status(400).json({detail:'日期需在站点当地昨天及以前，首尾包含且最多 366 天'});
  const requestId=String(req.body?.requestId||'');
  if(!/^[0-9a-f-]{36}$/i.test(requestId))return res.status(400).json({detail:'请求幂等 ID 无效'});
  const old=await prisma.productAnalysisCollectionRun.findUnique({where:{shopId_requestId:{shopId:shop.id,requestId}}});
  if(old){
    if(old.fromDate.toISOString().slice(0,10)!==dates.from||old.toDate.toISOString().slice(0,10)!==dates.to||
      old.recollectExisting!==(req.body?.recollectExisting===true))return res.status(409).json({detail:'幂等 ID 对应的采集条件不同'});
    try{return res.json(await recoverStarting(old));}catch(error){return safeError(res,error);}
  }
  const binding=await prisma.productAnalysisCollectorBinding.findUnique({where:{shopId:shop.id},include:{source:true}});
  if(!binding)return res.status(409).json({detail:'请先绑定 Shopee 店铺与浏览器凭据来源'});
  const active=await prisma.productAnalysisCollectionRun.findFirst({where:{shopId:shop.id,status:{in:activeStatuses}}});
  if(active){
    try {const recovered=await recoverStarting(active);
      if(recovered.status==='STARTING'||recovered.status==='PAUSED'||await syncRunStatus(recovered)==='ACTIVE')
      return res.status(409).json({detail:'同一店铺已有正在运行的采集任务'});}
    catch(error){return safeError(res,error);}
  }
  const recollectExisting=req.body?.recollectExisting===true;
  let run;
  try {run=await prisma.productAnalysisCollectionRun.create({data:{shopId:shop.id,userId:req.user!.id,requestId,
    fromDate:new Date(`${dates.from}T00:00:00Z`),toDate:new Date(`${dates.to}T00:00:00Z`),recollectExisting}});}
  catch {return res.status(409).json({detail:'采集任务冲突，请刷新后重试'});}
  try {
    const existing=recollectExisting?[]:await prisma.productAnalysisDailyUpload.findMany({where:{shopId:shop.id,isActive:true,
      date:{gte:run.fromDate,lte:run.toDate}},select:{date:true}});
    const batch=await collectorRequest<{batchId:number}>('/api/erp/batches',{method:'POST',body:{erpRunId:run.id,
      site:binding.site,shopId:binding.shopeeShopId,connectionId:binding.source.connectionId,
      ...dates,skipDates:existing.map(day=>day.date.toISOString().slice(0,10)),forceRecollect:recollectExisting}});
    run=await prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{collectorBatchId:batch.batchId,status:'ACTIVE'}});
    return res.status(201).json(run);
  }catch(error){
    // 响应丢失时采集器可能已经创建批次，保留 STARTING 供相同幂等 ID 恢复。
    try {
      const found=await collectorRequest<{batchId:number}>(`/api/erp/batches/by-run/${run.id}`);
      run=await prisma.productAnalysisCollectionRun.update({where:{id:run.id},
        data:{collectorBatchId:found.batchId,status:'ACTIVE'}});
      return res.status(201).json(run);
    }catch(lookupError){
      const status=lookupError&&typeof lookupError==='object'&&'status'in lookupError?Number(lookupError.status):0;
      if(status===404)await prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{status:'FAILED'}});
    }
    return safeError(res,error);
  }
});

router.get('/shops/:id/collection-runs',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  return res.json(await prisma.productAnalysisCollectionRun.findMany({where:{shopId:shop.id},orderBy:{createdAt:'desc'},take:20}));
});

router.get('/shops/:id/collection-runs/:runId',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  const foundRun=await prisma.productAnalysisCollectionRun.findFirst({where:{id:String(req.params.runId),shopId:shop.id}});
  let run=foundRun;
  if(run?.status==='STARTING'){
    try{run={...run,...await recoverStarting(run)};}catch(error){return safeError(res,error);}
  }
  if(!run)return res.status(404).json({detail:'Run not found'});
  if(!run.collectorBatchId)return res.json({run,batch:null,tasks:[]});
  try {
    const page=Math.max(1,Math.min(10000,Number(req.query.page)||1));
    const data=await collectorRequest<{batch:{counts:Record<string,number>;total:number};tasks:unknown[];page:number;pages:number}>(
      `/api/erp/batches/${run.collectorBatchId}?page=${page}&pageSize=20`);
    const status=await syncRunStatus(run);
    return res.json({run:{...run,status},batch:{counts:data.batch.counts,total:data.batch.total},
      tasks:(data.tasks as Array<Record<string,unknown>>).map(task=>({id:task.id,report_date:task.report_date,
        status:task.status,stage_detail:task.stage_detail,last_error:task.last_error,
        hasFile:!!task.file_path&&task.erp_run_id===run.id})),
      page:data.page,pages:data.pages});
  }catch(error){return safeError(res,error);}
});

for(const action of ['pause','resume','cancel','retry'] as const) {
  router.post(`/shops/:id/collection-runs/:runId/${action}`,async(req,res)=>{
    if(!(await allowed(req,res)))return;
    const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
    const run=await prisma.productAnalysisCollectionRun.findFirst({where:{id:String(req.params.runId),shopId:shop.id}});
    if(!run?.collectorBatchId)return res.status(404).json({detail:'Run not found'});
    try {
      const current=await syncRunStatus(run);
      const permitted:Record<typeof action,string[]>={pause:['ACTIVE'],resume:['PAUSED'],
        cancel:['ACTIVE','PAUSED'],retry:['FAILED']};
      if(!permitted[action].includes(current))return res.status(409).json({detail:'采集任务当前状态不允许此操作'});
      if(action==='resume'||action==='retry'){
        const other=await prisma.productAnalysisCollectionRun.findFirst({where:{shopId:shop.id,
          id:{not:run.id},status:{in:activeStatuses}}});
        if(other)return res.status(409).json({detail:'同一店铺已有正在运行的采集任务'});
      }
      const data=await collectorRequest(`/api/erp/batches/${run.collectorBatchId}/${action}`,{method:'POST'});
      const status=action==='pause'?'PAUSED':action==='cancel'?'CANCELLED':'ACTIVE';
      await prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{status}});
      return res.json({ok:true,status,data});
    }catch(error){return safeError(res,error);}
  });
}

router.get('/shops/:id/collection-runs/:runId/tasks/:taskId/download',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  const run=await prisma.productAnalysisCollectionRun.findFirst({where:{id:String(req.params.runId),shopId:shop.id}});
  if(!run?.collectorBatchId)return res.status(404).json({detail:'Run not found'});
  const taskId=Number(req.params.taskId);
  if(!/^[0-9]+$/.test(String(req.params.taskId))||!Number.isSafeInteger(taskId)||taskId<=0)
    return res.status(400).json({detail:'Task ID 无效'});
  try{
    const file=await collectorReportFile(run.collectorBatchId,taskId);
    res.setHeader('Cache-Control','private, no-store');
    return res.download(file.path,file.fileName);
  }catch(error){
    const status=error&&typeof error==='object'&&'status'in error?Number(error.status):0;
    if(status===404||status===409)return res.status(status).json({detail:error instanceof Error?error.message:'报表不可用'});
    return safeError(res,error);
  }
});

router.post('/shops/:id/collection-runs/:runId/tasks/:taskId/retry-upload',async(req,res)=>{
  if(!(await allowed(req,res)))return;
  const shop=await shopFor(req);if(!shop)return res.status(404).json({detail:'Shop not found'});
  const run=await prisma.productAnalysisCollectionRun.findFirst({where:{id:String(req.params.runId),shopId:shop.id}});
  if(!run?.collectorBatchId)return res.status(404).json({detail:'Run not found'});
  if(!/^\d+$/.test(String(req.params.taskId)))return res.status(400).json({detail:'Task ID 无效'});
  try{return res.json(await collectorRequest(`/api/erp/batches/${run.collectorBatchId}/tasks/${req.params.taskId}/retry-upload`,{method:'POST'}));}
  catch(error){return safeError(res,error);}
});

export default router;
