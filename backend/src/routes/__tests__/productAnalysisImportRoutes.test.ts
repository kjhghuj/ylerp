jest.mock('../../infrastructure/runtimeResources',()=>({prisma:{
  productAnalysisCollectionRun:{findUnique:jest.fn(),update:jest.fn()},
  productAnalysisCollectorImport:{findUnique:jest.fn(),create:jest.fn()},
}}));
jest.mock('../../services/productAnalysisCollectorClient',()=>({collectorRequest:jest.fn()}));

import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import type {Server} from 'node:http';
import router from '../productAnalysisImportRoutes';
import {prisma} from '../../infrastructure/runtimeResources';
import {collectorRequest} from '../../services/productAnalysisCollectorClient';

const runId='11111111-1111-4111-8111-111111111111';
const date='2026-07-31';
const bytes=Buffer.from('test workbook bytes');
const checksum=crypto.createHash('sha256').update(bytes).digest('hex');
const idem=`real:${runId}:ph|12345678|product_performance|${date}:${checksum}`;
const run={id:runId,shopId:'erp-shop',userId:'owner',status:'ACTIVE',collectorBatchId:42,
  fromDate:new Date('2026-07-30T00:00:00Z'),toDate:new Date('2026-08-01T00:00:00Z'),
  shop:{id:'erp-shop',collectorBinding:{shopId:'erp-shop',site:'PH',shopeeShopId:'12345678'}},
  user:{id:'owner'}};
let server:Server,origin:string,importRow:Record<string,unknown>|null;
const runFind=prisma.productAnalysisCollectionRun.findUnique as jest.Mock;
const importFind=prisma.productAnalysisCollectorImport.findUnique as jest.Mock;
const importCreate=prisma.productAnalysisCollectorImport.create as jest.Mock;

beforeAll(async()=>{
  process.env.ERP_IMPORT_SERVICE_TOKEN='test-import-token';
  const app=express();app.use('/api/imports',router);
  server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
});
afterAll(async()=>{
  await new Promise<void>(resolve=>server.close(()=>resolve()));
  if(importRow?.filePath)await fs.promises.unlink(String(importRow.filePath)).catch(()=>{});
  delete process.env.ERP_IMPORT_SERVICE_TOKEN;
});
beforeEach(()=>{
  jest.clearAllMocks();importRow=null;
  runFind.mockResolvedValue(run);
  importFind.mockImplementation(async()=>importRow);
  importCreate.mockImplementation(async({data}:{data:Record<string,unknown>})=>{
    importRow={...data,id:'import-1',rowCount:null,error:null};return importRow;
  });
  (collectorRequest as jest.Mock).mockResolvedValue({erpRunId:runId,site:'ph',shopId:'12345678',reportDate:date,checksum});
});

function form(mode='real'){
  const body=new FormData();
  for(const [key,value] of Object.entries({mode,reportType:'product_performance',erpRunId:runId,
    reportDate:date,checksum,taskId:'12',fileName:'ph_12345678_product_performance_20260731.xlsx',
    site:'ph',shopId:'12345678'}))body.set(key,value);
  body.set('file',new Blob([bytes]),'report.xlsx');
  return body;
}
const post=(body:FormData,token='test-import-token',key=idem)=>fetch(`${origin}/api/imports`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'X-Idempotency-Key':key},body});

test('service token and real mode are required',async()=>{
  expect((await post(form(),'wrong-token')).status).toBe(401);
  expect((await post(form('demo'))).status).toBe(400);
  expect(collectorRequest).not.toHaveBeenCalled();
});

test('uploaded task must match the collector batch and checksum',async()=>{
  (collectorRequest as jest.Mock).mockResolvedValueOnce({erpRunId:runId,site:'ph',shopId:'other',reportDate:date,checksum});
  expect((await post(form())).status).toBe(403);
  expect(importCreate).not.toHaveBeenCalled();
  expect((await post(form(),'test-import-token',idem.replace(checksum,'0'.repeat(64)))).status).toBe(409);
});

test('invalid file metadata and bytes are rejected before the import queue',async()=>{
  const wrongName=form();wrongName.set('fileName','report.html');
  expect((await post(wrongName)).status).toBe(400);
  const wrongBytes=form();wrongBytes.set('file',new Blob(['different bytes']),'report.xlsx');
  expect((await post(wrongBytes)).status).toBe(422);
  expect(importCreate).not.toHaveBeenCalled();
});

test('accepted uploads are persisted once per run, date and file checksum',async()=>{
  const first=await post(form());
  expect(first.status).toBe(202);
  expect((await first.json()).importId).toBe('import-1');
  const second=await post(form());
  expect(second.status).toBe(202);
  expect((await second.json()).dedup).toBe(true);
  expect(importCreate).toHaveBeenCalledTimes(1);
  expect(collectorRequest).toHaveBeenCalledWith('/api/erp/batches/42/tasks/12/file');
});
