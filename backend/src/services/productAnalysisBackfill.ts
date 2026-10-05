import {randomUUID} from 'node:crypto';
import {Prisma, type ProductAnalysisCollectionBackfill, type ProductAnalysisCollectionRun} from '@prisma/client';
import {prisma} from '../infrastructure/runtimeResources';
import {startScheduledTask} from '../infrastructure/scheduledTask';
import {addDays, dateInTz} from '../collector/dates';
import {collectorRequest} from './productAnalysisCollectorClient';
import {activeCollectionStatuses, syncRunStatus} from './productAnalysisCollectionRuns';

const TIMEZONES:Record<string,string> = {PH:'Asia/Manila',MY:'Asia/Kuala_Lumpur',SG:'Asia/Singapore'};
const ongoing = ['PENDING','RUNNING','WAITING','PAUSED'];
class SupersededBackfill extends Error {}

export function backfillDates(site:string, now=new Date()) {
  const today = dateInTz(now.getTime(), TIMEZONES[site] || 'Asia/Shanghai');
  return {from:addDays(today,-30),to:addDays(today,-1)};
}

/** The sync row and its entire shop scan are committed together, before acknowledging the plugin. */
export async function recordPluginSync(userId:string, now=new Date()) {
  for (let attempt=0; ; attempt++) {
    try {
      return await prisma.$transaction(async tx => {
        const sync = await tx.productAnalysisCollectionSync.upsert({where:{userId},
          create:{userId,lastPluginSyncedAt:now},update:{lastPluginSyncedAt:now,revision:{increment:1}}});
        const shops = await tx.productAnalysisShop.findMany({where:{userId},select:{id:true,site:true}});
        const previous = await tx.productAnalysisCollectionBackfill.findMany({where:{userId}});
        const byShop = new Map(previous.map(row => [row.shopId,row]));
        for (const shop of shops) {
          const dates = backfillDates(shop.site,now);
          const old = byShop.get(shop.id);
          const data = {userId,revision:sync.revision,fromDate:new Date(dates.from),toDate:new Date(dates.to),
            status:'PENDING',detail:null,completedDays:0,runId:old && ongoing.includes(old.status) ? old.runId : null};
          await tx.productAnalysisCollectionBackfill.upsert({where:{shopId:shop.id},create:{shopId:shop.id,...data},update:data});
        }
        return now.toISOString();
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (attempt >= 2 || !['P2034','P2002'].includes(code)) throw error;
    }
  }
}

export async function fetchCollectorSyncStatus(userId:string, now=new Date()) {
  const [sync,rows] = await Promise.all([
    prisma.productAnalysisCollectionSync.findUnique({where:{userId}}),
    prisma.productAnalysisCollectionBackfill.findMany({where:{userId},include:{shop:{select:{name:true,site:true}}},orderBy:{shop:{name:'asc'}}}),
  ]);
  const last = sync?.lastPluginSyncedAt || null;
  return {lastPluginSyncedAt:last?.toISOString() || null,
    syncedToday:!!last && dateInTz(last.getTime(),'Asia/Shanghai') === dateInTz(now.getTime(),'Asia/Shanghai'),
    active:rows.some(row => ongoing.includes(row.status) && row.status !== 'PAUSED'),
    shops:rows.map(row => ({shopId:row.shopId,name:row.shop.name,site:row.shop.site,status:row.status,
      from:row.fromDate.toISOString().slice(0,10),to:row.toDate.toISOString().slice(0,10),
      completedDays:row.completedDays,runId:row.runId,detail:row.detail}))};
}

async function updateBackfill(row:ProductAnalysisCollectionBackfill, data:Prisma.ProductAnalysisCollectionBackfillUncheckedUpdateManyInput) {
  // A newer sync or user cancellation takes precedence over this worker's snapshot.
  return prisma.productAnalysisCollectionBackfill.updateMany({where:{shopId:row.shopId,revision:row.revision,status:{in:ongoing}},data});
}

export async function processBackfillShop(row:ProductAnalysisCollectionBackfill) {
  const shop = await prisma.productAnalysisShop.findUnique({where:{id:row.shopId},include:{collectorBinding:{include:{source:true}}}});
  if (!shop || shop.userId !== row.userId) return;
  const actor = await prisma.user.findUnique({where:{id:row.userId},select:{role:true,isActive:true,permissions:true}});
  if (!actor?.isActive || (actor.role !== 'owner' && !actor.permissions.some(p => ['*','product-analysis','product-analysis.upload'].includes(p)))) {
    await updateBackfill(row,{status:'FAILED',detail:'账号已停用或采集权限已撤销'}); return;
  }
  if (shop.platform !== 'shopee' || !TIMEZONES[shop.site]) {
    await updateBackfill(row,{status:'UNSUPPORTED',detail:'目前仅支持 Shopee PH、MY、SG'}); return;
  }
  const binding = shop.collectorBinding;
  if (!binding) {await updateBackfill(row,{status:'NEEDS_BINDING',detail:'请在凭据详情中绑定 Shopee 店铺 ID'}); return;}

  const existing = await prisma.productAnalysisDailyUpload.findMany({where:{shopId:shop.id,isActive:true,
    date:{gte:row.fromDate,lte:row.toDate}},select:{date:true}});
  const completedDays = new Set(existing.map(day => day.date.toISOString().slice(0,10))).size;
  const from = row.fromDate.toISOString().slice(0,10), to = row.toDate.toISOString().slice(0,10);
  let run = row.runId ? await prisma.productAnalysisCollectionRun.findUnique({where:{id:row.runId}}) : null;
  if (run && (run.shopId !== shop.id || run.userId !== row.userId)) throw new Error('采集任务归属不匹配');
  if (run?.status === 'CANCELLED' || run?.status === 'FAILED') {
    await updateBackfill(row,{status:run.status,completedDays,detail:run.status === 'CANCELLED' ? '本轮补漏已取消' : '采集失败，请重试任务或重新通过插件同步'}); return;
  }
  if (run?.status === 'COMPLETED') run = null;
  run ||= await prisma.productAnalysisCollectionRun.findFirst({where:{shopId:shop.id,status:{in:activeCollectionStatuses}}});
  if (run) {
    if (run.status === 'STARTING' && !run.collectorBatchId) {
      // Recover the gap between the durable ERP run and the collector batch on restart.
      let batchId:number;
      try {batchId = (await collectorRequest<{batchId:number}>(`/api/erp/batches/by-run/${run.id}`)).batchId;}
      catch (error) {
        if (!(error && typeof error === 'object' && 'status' in error && error.status === 404)) throw error;
        const skip = await prisma.productAnalysisDailyUpload.findMany({where:{shopId:shop.id,isActive:true,
          date:{gte:run.fromDate,lte:run.toDate}},select:{date:true}});
        try{
          batchId = (await collectorRequest<{batchId:number}>('/api/erp/batches',{method:'POST',body:{erpRunId:run.id,
            site:binding.site,shopId:binding.shopeeShopId,connectionId:binding.source.connectionId,
            from:run.fromDate.toISOString().slice(0,10),to:run.toDate.toISOString().slice(0,10),
            skipDates:run.recollectExisting ? [] : skip.map(day => day.date.toISOString().slice(0,10)),forceRecollect:run.recollectExisting}})).batchId;
        }catch(admissionError){
          try{batchId=(await collectorRequest<{batchId:number}>(`/api/erp/batches/by-run/${run.id}`)).batchId;}
          catch(lookup){
            if(lookup&&typeof lookup==='object'&&'status' in lookup&&lookup.status===404){
              await prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{status:'FAILED'}});
              await updateBackfill(row,{runId:run.id,status:'FAILED',completedDays,detail:'无法恢复采集，请检查凭据后重新同步'});return;
            }
            throw admissionError;
          }
        }
      }
      run = await prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{collectorBatchId:batchId,status:'ACTIVE'}});
    }
    const status = await syncRunStatus(run);
    if (status === 'FAILED' || status === 'CANCELLED') {
      await updateBackfill(row,{runId:run.id,status,completedDays,detail:'采集未完成，请查看任务进度'}); return;
    }
    if (status !== 'COMPLETED') {
      await updateBackfill(row,{runId:run.id,completedDays,status:status === 'PAUSED' ? 'PAUSED' : row.status === 'RUNNING' ? 'RUNNING' : 'WAITING',
        detail:status === 'PAUSED' ? '等待继续已暂停的采集任务' : '正在采集，完成后检查剩余缺口'}); return;
    }
    // Imports may have completed after the earlier date query. Recheck next tick.
    await updateBackfill(row,{runId:null,status:'PENDING',completedDays,detail:null}); return;
  }
  if (completedDays >= 30) {await updateBackfill(row,{status:'COMPLETED',runId:null,completedDays:30,detail:'近 30 天数据已齐全'}); return;}

  let created:ProductAnalysisCollectionRun;
  try {
    created = await prisma.$transaction(async tx=>{
      const newRun=await tx.productAnalysisCollectionRun.create({data:{shopId:shop.id,userId:row.userId,requestId:randomUUID(),
        fromDate:row.fromDate,toDate:row.toDate,recollectExisting:false}});
      const linked=await tx.productAnalysisCollectionBackfill.updateMany({where:{shopId:row.shopId,revision:row.revision,status:{in:ongoing}},
        data:{runId:newRun.id,status:'RUNNING',completedDays,detail:null}});
      if(!linked.count)throw new SupersededBackfill();
      return newRun;
    });
  } catch (error) {
    if(error instanceof SupersededBackfill)return;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      await updateBackfill(row,{status:'WAITING',completedDays,detail:'等待当前店铺采集任务'}); return;
    }
    throw error;
  }
  // Run and linkage are durable together; a crash before dispatch leaves recoverable STARTING work.
  try {
    const batch = await collectorRequest<{batchId:number}>('/api/erp/batches',{method:'POST',body:{erpRunId:created.id,
      site:binding.site,shopId:binding.shopeeShopId,connectionId:binding.source.connectionId,
      from,to,skipDates:existing.map(day => day.date.toISOString().slice(0,10)),forceRecollect:false}});
    await prisma.productAnalysisCollectionRun.update({where:{id:created.id},data:{collectorBatchId:batch.batchId,status:'ACTIVE'}});
  } catch (error) {
    // Leave STARTING linked: only a confirmed missing batch may mark it failed.
    try {
      const found = await collectorRequest<{batchId:number}>(`/api/erp/batches/by-run/${created.id}`);
      await prisma.productAnalysisCollectionRun.update({where:{id:created.id},data:{collectorBatchId:found.batchId,status:'ACTIVE'}});
    } catch (lookup) {
      if (lookup && typeof lookup === 'object' && 'status' in lookup && lookup.status === 404) {
        await prisma.productAnalysisCollectionRun.update({where:{id:created.id},data:{status:'FAILED'}});
        await updateBackfill(row,{status:'FAILED',detail:'无法启动采集，请检查凭据后重新同步'});
      } else throw error;
    }
  }
}

/** Explicit user controls also update the durable scan, so polling cannot undo cancellation. */
export async function notifyBackfillRunAction(shopId:string, runId:string, action:'pause'|'resume'|'cancel'|'retry',
  db:Pick<Prisma.TransactionClient,'productAnalysisCollectionBackfill'>=prisma) {
  await db.productAnalysisCollectionBackfill.updateMany({where:{shopId,
    OR:[{runId},{runId:null,status:{in:ongoing}}]},data:{runId,
    status:action === 'cancel' ? 'CANCELLED' : action === 'pause' ? 'PAUSED' : 'PENDING',
    detail:action === 'cancel' ? '本轮补漏已取消' : action === 'pause' ? '等待继续已暂停的采集任务' : null}});
}

let processing = false;
export async function processProductAnalysisBackfills() {
  if (processing) return;
  processing = true;
  try {
    const rows = await prisma.productAnalysisCollectionBackfill.findMany({where:{status:{in:ongoing}},orderBy:{updatedAt:'asc'},take:50});
    for (const row of rows) {
      try {await processBackfillShop(row);}
      catch {await updateBackfill(row,{detail:'补漏暂时无法执行，将自动重试；请检查采集服务'});}
    }
  } catch (error) {console.error('Product analysis backfill worker unavailable:', error instanceof Error ? error.name : 'unknown');}
  finally {processing = false;}
}

export function startProductAnalysisBackfillWorker() {
  return startScheduledTask(processProductAnalysisBackfills,{intervalMs:4_000,immediate:true});
}
