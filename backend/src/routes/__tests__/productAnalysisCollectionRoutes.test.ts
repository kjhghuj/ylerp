jest.mock('../../index',()=>({prisma:{
  user:{findUnique:jest.fn()},
  productAnalysisShop:{findFirst:jest.fn()},
  productAnalysisCredentialSource:{findFirst:jest.fn(),findMany:jest.fn()},
  productAnalysisCollectorBinding:{findUnique:jest.fn()},
  productAnalysisCollectionRun:{findUnique:jest.fn(),findFirst:jest.fn(),create:jest.fn(),update:jest.fn()},
  productAnalysisDailyUpload:{findMany:jest.fn()},
}}));
jest.mock('../../services/productAnalysisCollectorClient',()=>({collectorRequest:jest.fn(),collectorReportFile:jest.fn()}));

import type {Request,Response} from 'express';
import router from '../productAnalysisCollectionRoutes';
import {prisma} from '../../index';
import {collectorRequest,collectorReportFile} from '../../services/productAnalysisCollectorClient';

const shop={id:'shop-a',userId:'user-a',name:'PH 店',site:'PH',currency:'PHP'};
const owner={id:'user-a',username:'owner',role:'owner',permissions:[]};
function handler(path:string,method:string){
  const layer=(router as unknown as {stack:{route?:{path:string;methods:Record<string,boolean>;stack:{handle:Function}[]}}[]}).stack
    .find(item=>item.route?.path===path&&item.route.methods[method]);
  if(!layer?.route)throw Error('route missing');
  return layer.route.stack.at(-1)!.handle;
}
async function invoke(path:string,method:string,input:{user?:unknown;params?:unknown;body?:unknown}={}){
  const status=jest.fn().mockReturnThis(),json=jest.fn().mockReturnThis(),download=jest.fn(),setHeader=jest.fn();
  const res={status,json,download,setHeader} as unknown as Response;
  const req={user:input.user??owner,params:input.params??{id:'shop-a'},body:input.body??{}} as Request;
  await handler(path,method)(req,res);
  return {status,json,download,setHeader};
}
const shopFind=prisma.productAnalysisShop.findFirst as jest.Mock;
const sourceFind=prisma.productAnalysisCredentialSource.findFirst as jest.Mock;
const runFind=prisma.productAnalysisCollectionRun.findUnique as jest.Mock;
const activeFind=prisma.productAnalysisCollectionRun.findFirst as jest.Mock;
const bindingFind=prisma.productAnalysisCollectorBinding.findUnique as jest.Mock;
const runCreate=prisma.productAnalysisCollectionRun.create as jest.Mock;
const runUpdate=prisma.productAnalysisCollectionRun.update as jest.Mock;
const dailyFind=prisma.productAnalysisDailyUpload.findMany as jest.Mock;

beforeEach(()=>{jest.clearAllMocks();shopFind.mockResolvedValue(shop);runFind.mockResolvedValue(null);activeFind.mockResolvedValue(null);
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({permissions:[],isActive:true});});

test('upload permission is required before reading a shop or a credential',async()=>{
  const r=await invoke('/shops/:id/collector-binding','get',{user:{id:'user-a',role:'viewer',permissions:[]}});
  expect(r.status).toHaveBeenCalledWith(403);
  expect(shopFind).not.toHaveBeenCalled();
});

test('original report download checks ERP shop and run ownership before accessing a file',async()=>{
  const endpoint='/shops/:id/collection-runs/:runId/tasks/:taskId/download';
  const params={id:shop.id,runId:'run-1',taskId:'42'};
  shopFind.mockResolvedValueOnce(null);
  expect((await invoke(endpoint,'get',{params})).status).toHaveBeenCalledWith(404);
  expect(collectorReportFile).not.toHaveBeenCalled();
  activeFind.mockResolvedValueOnce(null);
  expect((await invoke(endpoint,'get',{params})).status).toHaveBeenCalledWith(404);
  expect(collectorReportFile).not.toHaveBeenCalled();
  activeFind.mockResolvedValueOnce({id:'run-1',shopId:shop.id,collectorBatchId:7});
  (collectorReportFile as jest.Mock).mockResolvedValueOnce({path:'/erp-data/report.xlsx',fileName:'report.xlsx'});
  const result=await invoke(endpoint,'get',{params});
  expect(activeFind).toHaveBeenLastCalledWith({where:{id:'run-1',shopId:shop.id}});
  expect(collectorReportFile).toHaveBeenCalledWith(7,42);
  expect(result.setHeader).toHaveBeenCalledWith('Cache-Control','private, no-store');
  expect(result.download).toHaveBeenCalledWith('/erp-data/report.xlsx','report.xlsx');
});

test('original report download rejects invalid IDs and unavailable files',async()=>{
  const endpoint='/shops/:id/collection-runs/:runId/tasks/:taskId/download';
  activeFind.mockResolvedValue({id:'run-1',shopId:shop.id,collectorBatchId:7});
  expect((await invoke(endpoint,'get',{params:{id:shop.id,runId:'run-1',taskId:'../1'}})).status).toHaveBeenCalledWith(400);
  expect(collectorReportFile).not.toHaveBeenCalled();
  (collectorReportFile as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('批次报表不存在'),{status:404}));
  const result=await invoke(endpoint,'get',{params:{id:shop.id,runId:'run-1',taskId:'42'}});
  expect(result.status).toHaveBeenCalledWith(404);
  expect(result.download).not.toHaveBeenCalled();
});

test('revoked upload permission takes effect even when the login token is stale',async()=>{
  const r=await invoke('/shops/:id/collector-binding','get',
    {user:{id:'user-a',role:'staff',permissions:['product-analysis.upload']}});
  expect(r.status).toHaveBeenCalledWith(403);
  expect(shopFind).not.toHaveBeenCalled();
});

test('a shop owned by another ERP account is invisible',async()=>{
  shopFind.mockResolvedValue(null);
  const r=await invoke('/shops/:id/collector-binding','get');
  expect(r.status).toHaveBeenCalledWith(404);
  expect(shopFind).toHaveBeenCalledWith({where:{id:'shop-a',userId:'user-a'}});
});

test('a credential source from another account cannot bind',async()=>{
  sourceFind.mockResolvedValue(null);
  const r=await invoke('/shops/:id/collector-binding','post',{body:{sourceId:'foreign',shopeeShopId:'12345678'}});
  expect(r.status).toHaveBeenCalledWith(404);
  expect(sourceFind).toHaveBeenCalledWith({where:{id:'foreign',userId:'user-a'}});
  expect(collectorRequest).not.toHaveBeenCalled();
});

test.each([[],[null],[{name:'',value:'x'}],[{name:'x',value:42}],Array(301).fill({name:'x',value:'y'})].map(cookies=>({cookies})))(
  'manual credentials reject invalid cookie arrays (%#)',async({cookies})=>{
    sourceFind.mockResolvedValue({id:'source-a',connectionId:'connection-a'});
    const result=await invoke('/shops/:id/credential-sources/:sourceId/manual','post',{
      params:{id:shop.id,sourceId:'source-a'},body:{cookies,spcCds:'test-cds'}});
    expect(result.status).toHaveBeenCalledWith(400);expect(collectorRequest).not.toHaveBeenCalled();
  });

test('manual credentials require a nonblank separate SPC_CDS',async()=>{
  sourceFind.mockResolvedValue({id:'source-a',connectionId:'connection-a'});
  const result=await invoke('/shops/:id/credential-sources/:sourceId/manual','post',{
    params:{id:shop.id,sourceId:'source-a'},body:{cookies:[{name:'SPC_EC',value:'test'}],spcCds:'  '}});
  expect(result.status).toHaveBeenCalledWith(400);expect(collectorRequest).not.toHaveBeenCalled();
});

test('manual credentials preserve Cookie-Editor metadata and trim the separate SPC_CDS',async()=>{
  sourceFind.mockResolvedValue({id:'source-a',connectionId:'connection-a'});
  (collectorRequest as jest.Mock).mockResolvedValue({status:'pending'});
  const cookies=[{name:'SPC_EC',value:'test-session',domain:'.shopee.ph',path:'/',httpOnly:true,secure:true}];
  await invoke('/shops/:id/credential-sources/:sourceId/manual','post',{
    params:{id:shop.id,sourceId:'source-a'},body:{cookies,spcCds:' test-cds '}});
  expect(collectorRequest).toHaveBeenCalledWith('/api/erp/connections/connection-a/manual',{
    method:'POST',body:{cookies,spcCds:'test-cds'}});
});

test('manual credentials cannot update a source owned by another account',async()=>{
  sourceFind.mockResolvedValue(null);
  const result=await invoke('/shops/:id/credential-sources/:sourceId/manual','post',{
    params:{id:shop.id,sourceId:'foreign'},body:{cookies:[{name:'SPC_EC',value:'test'}],spcCds:'test-cds'}});
  expect(result.status).toHaveBeenCalledWith(404);expect(collectorRequest).not.toHaveBeenCalled();
});

test('unsupported site and invalid date boundaries never reach the collector',async()=>{
  shopFind.mockResolvedValueOnce({...shop,site:'ID'});
  const unsupported=await invoke('/shops/:id/collection-runs','post',{body:{from:'2026-09-01',to:'2026-09-02'}});
  expect(unsupported.status).toHaveBeenCalledWith(400);
  const future=await invoke('/shops/:id/collection-runs','post',{body:{from:'2026-09-01',to:'2099-01-01'}});
  expect(future.status).toHaveBeenCalledWith(400);
  const long=await invoke('/shops/:id/collection-runs','post',{body:{from:'2024-01-01',to:'2025-01-02'}});
  expect(long.status).toHaveBeenCalledWith(400);
  expect(collectorRequest).not.toHaveBeenCalled();
});

test('existing active daily reports are sent as skipped dates',async()=>{
  const run={id:'11111111-1111-4111-8111-111111111111',shopId:shop.id,userId:owner.id,
    fromDate:new Date('2026-07-30T00:00:00Z'),toDate:new Date('2026-08-01T00:00:00Z'),
    recollectExisting:false,status:'STARTING',collectorBatchId:null};
  bindingFind.mockResolvedValue({shopId:shop.id,site:'PH',shopeeShopId:'12345678',source:{connectionId:'source-connection'}});
  runCreate.mockResolvedValue(run);
  runUpdate.mockImplementation(async({data}:{data:Record<string,unknown>})=>({...run,...data}));
  dailyFind.mockResolvedValue([{date:new Date('2026-07-31T00:00:00Z')}]);
  (collectorRequest as jest.Mock).mockResolvedValue({batchId:42});
  const result=await invoke('/shops/:id/collection-runs','post',{body:{from:'2026-07-30',to:'2026-08-01',
    recollectExisting:false,requestId:'22222222-2222-4222-8222-222222222222'}});
  expect(result.status).toHaveBeenCalledWith(201);
  expect(collectorRequest).toHaveBeenCalledWith('/api/erp/batches',expect.objectContaining({
    body:expect.objectContaining({erpRunId:run.id,skipDates:['2026-07-31'],forceRecollect:false})}));
});

test('recollection exports existing dates while a rejected session fails closed',async()=>{
  const run={id:'11111111-1111-4111-8111-111111111111',shopId:shop.id,userId:owner.id,
    fromDate:new Date('2026-07-31T00:00:00Z'),toDate:new Date('2026-07-31T00:00:00Z'),
    recollectExisting:true,status:'STARTING',collectorBatchId:null};
  bindingFind.mockResolvedValue({shopId:shop.id,site:'PH',shopeeShopId:'12345678',source:{connectionId:'source-connection'}});
  runCreate.mockResolvedValue(run);
  runUpdate.mockImplementation(async({data}:{data:Record<string,unknown>})=>({...run,...data}));
  (collectorRequest as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('Cookie 已失效'),{status:409}))
    .mockRejectedValueOnce(Object.assign(new Error('not found'),{status:404}));
  const result=await invoke('/shops/:id/collection-runs','post',{body:{from:'2026-07-31',to:'2026-07-31',
    recollectExisting:true,requestId:'22222222-2222-4222-8222-222222222222'}});
  expect(result.status).toHaveBeenCalledWith(409);
  expect(collectorRequest).toHaveBeenCalledWith('/api/erp/batches',expect.objectContaining({
    body:expect.objectContaining({skipDates:[],forceRecollect:true})}));
  expect(dailyFind).not.toHaveBeenCalled();
  expect(runUpdate).toHaveBeenCalledWith({where:{id:run.id},data:{status:'FAILED'}});
});
