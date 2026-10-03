import type {ProductAnalysisCollectionRun} from '@prisma/client';
import {prisma} from '../index';
import {collectorRequest} from './productAnalysisCollectorClient';

export const activeCollectionStatuses = ['STARTING', 'ACTIVE', 'PAUSED'];

export async function syncRunStatus(run: {id:string;status:string;collectorBatchId:number|null}) {
  if (!run.collectorBatchId || ['PAUSED','CANCELLED','COMPLETED','FAILED'].includes(run.status)) return run.status;
  const data = await collectorRequest<{batch:{counts:Record<string,number>;total:number}}>(`/api/erp/batches/${run.collectorBatchId}`);
  const counts = data.batch.counts;
  const done = (counts.IMPORTED || 0) + (counts.SKIPPED || 0) === data.batch.total;
  const working = Object.entries(counts).some(([key,count]) => count > 0 && !['IMPORTED','SKIPPED','FAILED'].includes(key));
  const status = done ? 'COMPLETED' : !working && counts.FAILED ? 'FAILED' : run.status;
  if (status !== run.status) {
    const changed = await prisma.productAnalysisCollectionRun.updateMany({where:{id:run.id,status:run.status},data:{status}});
    if (!changed.count) return (await prisma.productAnalysisCollectionRun.findUnique({where:{id:run.id}}))?.status || run.status;
  }
  return status;
}

export async function recoverStarting<T extends {id:string;status:string;collectorBatchId:number|null;createdAt:Date}>(run:T):Promise<T | ProductAnalysisCollectionRun> {
  if (run.status !== 'STARTING' || run.collectorBatchId) return run;
  try {
    const found = await collectorRequest<{batchId:number}>(`/api/erp/batches/by-run/${run.id}`);
    return prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{collectorBatchId:found.batchId,status:'ACTIVE'}});
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
    if (status !== 404 || Date.now() - run.createdAt.getTime() < 60_000) throw error;
    return prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{status:'FAILED'}});
  }
}
