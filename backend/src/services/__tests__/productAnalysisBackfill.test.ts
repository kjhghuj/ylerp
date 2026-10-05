jest.mock('../../infrastructure/runtimeResources', () => ({prisma: {
  $transaction: jest.fn(),
  productAnalysisCollectionSync: {upsert: jest.fn(), findUnique: jest.fn()},
  productAnalysisCollectionBackfill: {findMany: jest.fn(), upsert: jest.fn(), updateMany: jest.fn()},
  productAnalysisShop: {findMany: jest.fn(), findUnique: jest.fn()},
  productAnalysisDailyUpload: {findMany: jest.fn()},
  productAnalysisCollectionRun: {findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn()},
  user: {findUnique: jest.fn()},
}}));
jest.mock('../productAnalysisCollectorClient', () => ({collectorRequest: jest.fn()}));

import {prisma} from '../../infrastructure/runtimeResources';
import {collectorRequest} from '../productAnalysisCollectorClient';
import {backfillDates, recordPluginSync, fetchCollectorSyncStatus, processBackfillShop,processProductAnalysisBackfills,
  notifyBackfillRunAction,startProductAnalysisBackfillWorker} from '../productAnalysisBackfill';

const db = prisma as any;
const now = new Date('2026-10-03T08:00:00Z');
const dates = {from: '2026-09-03', to: '2026-10-02'};
const row = {shopId:'shop-a',userId:'user-a',revision:1,fromDate:new Date(dates.from),toDate:new Date(dates.to),
  status:'PENDING',runId:null,completedDays:0,detail:null,updatedAt:now};
const shop = {id:'shop-a',userId:'user-a',name:'A',platform:'shopee',site:'PH',
  collectorBinding:{site:'PH',shopeeShopId:'12345678',source:{connectionId:'connection-a'}}};
const run = {id:'run-a',shopId:'shop-a',userId:'user-a',status:'ACTIVE',collectorBatchId:1,
  fromDate:row.fromDate,toDate:row.toDate,recollectExisting:false,createdAt:now};

beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation((work: any) => work(db));
  db.user.findUnique.mockResolvedValue({role:'owner',isActive:true,permissions:[]});
  db.productAnalysisShop.findUnique.mockResolvedValue(shop);
  db.productAnalysisShop.findMany.mockResolvedValue([shop]);
  db.productAnalysisCollectionBackfill.findMany.mockResolvedValue([]);
  db.productAnalysisCollectionBackfill.updateMany.mockResolvedValue({count:1});
  db.productAnalysisDailyUpload.findMany.mockResolvedValue([]);
  db.productAnalysisCollectionRun.findFirst.mockResolvedValue(null);
  db.productAnalysisCollectionRun.create.mockResolvedValue({...run,status:'STARTING',collectorBatchId:null});
  db.productAnalysisCollectionRun.update.mockResolvedValue(run);
  db.productAnalysisCollectionRun.updateMany.mockResolvedValue({count:1});
  (collectorRequest as jest.Mock).mockResolvedValue({batchId:1,batch:{counts:{PENDING:30},total:30}});
});

test('checks exactly 30 completed local dates at midnight and across leap day', () => {
  expect(backfillDates('PH',now)).toEqual(dates);
  expect(backfillDates('SG',new Date('2026-10-02T16:00:00Z'))).toEqual(dates);
  expect(backfillDates('MY',new Date('2024-03-01T00:00:00Z'))).toEqual({from:'2024-01-31',to:'2024-02-29'});
});

test('each successful plugin upload persists a new timestamp and merges running work', async () => {
  db.productAnalysisCollectionSync.upsert.mockResolvedValue({userId:'user-a',revision:2,lastPluginSyncedAt:now});
  db.productAnalysisCollectionBackfill.findMany.mockResolvedValue([{...row,status:'RUNNING',runId:'run-a'}]);
  await recordPluginSync('user-a',now);
  expect(db.productAnalysisCollectionSync.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where:{userId:'user-a'},update:{lastPluginSyncedAt:now,revision:{increment:1}},
  }));
  expect(db.productAnalysisShop.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{userId:'user-a'}}));
  expect(db.productAnalysisCollectionBackfill.upsert).toHaveBeenCalledWith(expect.objectContaining({
    update:expect.objectContaining({revision:2,runId:'run-a',status:'PENDING'}),
  }));
});

test('status uses Beijing dates and contains no credential payload', async () => {
  db.productAnalysisCollectionSync.findUnique.mockResolvedValue({lastPluginSyncedAt:new Date('2026-10-02T16:01:00Z'),revision:1});
  db.productAnalysisCollectionBackfill.findMany.mockResolvedValue([{...row,shop:{name:'A',site:'PH'}}]);
  const status = await fetchCollectorSyncStatus('user-a',now);
  expect(status.syncedToday).toBe(true);
  expect(status.shops[0]).toEqual(expect.objectContaining({shopId:'shop-a',status:'PENDING'}));
  expect(JSON.stringify(status)).not.toMatch(/cookies|spcCds/);
  expect((await fetchCollectorSyncStatus('user-a',new Date('2026-10-03T16:00:00Z'))).syncedToday).toBe(false);
  db.productAnalysisCollectionSync.findUnique.mockResolvedValue(null);
  expect((await fetchCollectorSyncStatus('user-a',now)).lastPluginSyncedAt).toBeNull();
});

test('complete shop creates no batch', async () => {
  db.productAnalysisDailyUpload.findMany.mockResolvedValue(Array.from({length:30},(_,i) => ({date:new Date(Date.UTC(2026,8,3+i))})));
  await processBackfillShop(row);
  expect(db.productAnalysisCollectionRun.create).not.toHaveBeenCalled();
  expect(collectorRequest).not.toHaveBeenCalled();
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'COMPLETED',completedDays:30})}));
});

test('only missing dates are collected and today is excluded', async () => {
  db.productAnalysisDailyUpload.findMany.mockResolvedValue([{date:new Date('2026-09-04')}]);
  await processBackfillShop(row);
  expect(collectorRequest).toHaveBeenCalledWith('/api/erp/batches',expect.objectContaining({body:expect.objectContaining({
    ...dates,skipDates:['2026-09-04'],forceRecollect:false,erpRunId:'run-a',
  })}));
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({status:'RUNNING',runId:'run-a'})}));
});

test.each(['PAUSED','ACTIVE'])('preserves %s tasks without creating overlapping batches', async status => {
  db.productAnalysisCollectionRun.findFirst.mockResolvedValue({...run,status});
  (collectorRequest as jest.Mock).mockResolvedValue({batch:{counts:{PENDING:30},total:30}});
  await processBackfillShop(row);
  expect(db.productAnalysisCollectionRun.create).not.toHaveBeenCalled();
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:status==='PAUSED'?'PAUSED':'WAITING',runId:'run-a'})}));
});

test.each(['FAILED','CANCELLED'])('does not restart a tracked %s run', async status => {
  db.productAnalysisCollectionRun.findUnique.mockResolvedValue({...run,status});
  await processBackfillShop({...row,runId:'run-a'});
  expect(db.productAnalysisCollectionRun.create).not.toHaveBeenCalled();
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status})}));
});

test('rechecks gaps after an existing run completes', async () => {
  db.productAnalysisCollectionRun.findUnique.mockResolvedValue({...run,status:'COMPLETED'});
  await processBackfillShop({...row,runId:'previous-run'});
  expect(db.productAnalysisCollectionRun.create).toHaveBeenCalled();
});

test('recovers a persisted STARTING run by its batch before creating another', async () => {
  db.productAnalysisCollectionRun.findUnique.mockResolvedValue({...run,status:'STARTING',collectorBatchId:null});
  await processBackfillShop({...row,runId:'run-a'});
  expect(collectorRequest).toHaveBeenCalledWith('/api/erp/batches/by-run/run-a');
  expect(db.productAnalysisCollectionRun.create).not.toHaveBeenCalled();
});

test.each([
  {value:{...shop,collectorBinding:null},status:'NEEDS_BINDING'},
  {value:{...shop,site:'TH'},status:'UNSUPPORTED'},
])('reports unavailable shops without scheduling collection ($status)', async ({value,status}) => {
  db.productAnalysisShop.findUnique.mockResolvedValue(value);
  await processBackfillShop(row);
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status})}));
  expect(collectorRequest).not.toHaveBeenCalled();
});

test('retries a conflicting plugin registration transaction without losing the timestamp',async()=>{
  db.$transaction.mockRejectedValueOnce(Object.assign(new Error('serialization'),{code:'P2034'}));
  db.productAnalysisCollectionSync.upsert.mockResolvedValue({revision:2});
  expect(await recordPluginSync('user-a',now)).toBe(now.toISOString());
  expect(db.$transaction).toHaveBeenCalledTimes(2);
});

test('revoked permissions fail the scan before accessing the collector',async()=>{
  db.user.findUnique.mockResolvedValue({role:'staff',isActive:true,permissions:[]});
  await processBackfillShop(row);
  expect(collectorRequest).not.toHaveBeenCalled();
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED'})}));
});

test('a run that finishes on this tick is rechecked on the next tick',async()=>{
  db.productAnalysisCollectionRun.findFirst.mockResolvedValue(run);
  (collectorRequest as jest.Mock).mockResolvedValue({batch:{counts:{IMPORTED:30},total:30}});
  await processBackfillShop(row);
  expect(db.productAnalysisCollectionRun.updateMany).toHaveBeenCalledWith({where:{id:run.id,status:'ACTIVE'},data:{status:'COMPLETED'}});
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'PENDING',runId:null})}));
});

test('a failed current batch stops only that shop and exposes a retryable state',async()=>{
  db.productAnalysisCollectionRun.findFirst.mockResolvedValue(run);
  (collectorRequest as jest.Mock).mockResolvedValue({batch:{counts:{IMPORTED:20,FAILED:10},total:30}});
  await processBackfillShop(row);
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED',runId:run.id})}));
});

test('recovers a crash before the STARTING batch was dispatched',async()=>{
  db.productAnalysisCollectionRun.findUnique.mockResolvedValue({...run,status:'STARTING',collectorBatchId:null});
  (collectorRequest as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('missing'),{status:404}));
  await processBackfillShop({...row,runId:run.id});
  expect(collectorRequest).toHaveBeenCalledWith('/api/erp/batches',expect.objectContaining({body:expect.objectContaining({erpRunId:run.id,forceRecollect:false,...dates})}));
  expect(db.productAnalysisCollectionRun.create).not.toHaveBeenCalled();
});

test('an unrecoverable STARTING admission failure releases the active-shop slot',async()=>{
  db.productAnalysisCollectionRun.findUnique.mockResolvedValue({...run,status:'STARTING',collectorBatchId:null});
  (collectorRequest as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('missing'),{status:404}))
    .mockRejectedValueOnce(new Error('invalid credentials')).mockRejectedValueOnce(Object.assign(new Error('missing'),{status:404}));
  await processBackfillShop({...row,runId:run.id});
  expect(db.productAnalysisCollectionRun.update).toHaveBeenCalledWith({where:{id:run.id},data:{status:'FAILED'}});
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED'})}));
});

test('creation conflicts wait instead of scheduling overlapping runs',async()=>{
  db.productAnalysisCollectionRun.create.mockRejectedValue(Object.assign(new Error('active index'),{code:'P2002'}));
  await processBackfillShop(row);
  expect(collectorRequest).not.toHaveBeenCalled();
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'WAITING'})}));
});

test('a superseded request rolls back its run registration before dispatch',async()=>{
  db.productAnalysisCollectionBackfill.updateMany.mockResolvedValue({count:0});
  await processBackfillShop(row);
  expect(collectorRequest).not.toHaveBeenCalled();
});

test('a lost batch response recovers the existing batch by ERP run ID',async()=>{
  (collectorRequest as jest.Mock).mockRejectedValueOnce(new Error('lost response')).mockResolvedValueOnce({batchId:9});
  await processBackfillShop(row);
  expect(db.productAnalysisCollectionRun.update).toHaveBeenCalledWith({where:{id:run.id},data:{collectorBatchId:9,status:'ACTIVE'}});
});

test('a confirmed batch admission failure remains failed until another sync or explicit retry',async()=>{
  (collectorRequest as jest.Mock).mockRejectedValueOnce(new Error('missing credentials')).mockRejectedValueOnce(Object.assign(new Error('missing batch'),{status:404}));
  await processBackfillShop(row);
  expect(db.productAnalysisCollectionRun.update).toHaveBeenCalledWith({where:{id:run.id},data:{status:'FAILED'}});
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({data:expect.objectContaining({status:'FAILED'})}));
});

test.each(['pause','resume','cancel','retry'] as const)('persists user %s without restarting cancelled work from a stale snapshot',async action=>{
  await notifyBackfillRunAction('shop-a','run-a',action);
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where:expect.objectContaining({shopId:'shop-a'}),data:expect.objectContaining({runId:'run-a',
      status:action==='cancel'?'CANCELLED':action==='pause'?'PAUSED':'PENDING'}),
  }));
});

test('one unavailable shop does not block other shops, and pending work is read from storage after restart',async()=>{
  const b={...row,shopId:'shop-b'};
  db.productAnalysisCollectionBackfill.findMany.mockResolvedValue([row,b]);
  db.productAnalysisShop.findUnique.mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce({...shop,id:b.shopId,collectorBinding:null});
  await processProductAnalysisBackfills();
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({shopId:'shop-a',revision:1}),data:expect.objectContaining({detail:expect.stringContaining('自动重试')})}));
  expect(db.productAnalysisCollectionBackfill.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({shopId:'shop-b'}),data:expect.objectContaining({status:'NEEDS_BINDING'})}));
  expect(db.productAnalysisCollectionBackfill.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{status:{in:['PENDING','RUNNING','WAITING','PAUSED']}}}));
});

test('overlapping worker ticks are serialized and the stop callback clears the timer',async()=>{
  let resolve!:(rows:any[])=>void;
  db.productAnalysisCollectionBackfill.findMany.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  const first=processProductAnalysisBackfills();
  await processProductAnalysisBackfills();
  expect(db.productAnalysisCollectionBackfill.findMany).toHaveBeenCalledTimes(1);
  resolve([]);await first;
  jest.useFakeTimers();
  const stop=startProductAnalysisBackfillWorker();
  await Promise.resolve();await Promise.resolve();
  expect(jest.getTimerCount()).toBe(1);stop();expect(jest.getTimerCount()).toBe(0);
  jest.useRealTimers();
});
