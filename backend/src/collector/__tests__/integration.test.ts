import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {CollectorRuntime} from '../runtime';
import {loadConfig} from '../config';
import {migrateCollectorData} from '../migrate';
import {TaskStatus} from '../states';
import {checksumOf} from '../validate';
import {workbookFixture} from './workbookFixture';
import {CredentialInputError} from '../credentials';

const runId='11111111-1111-4111-8111-111111111111';
const accountKey='erp-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fixture=()=>workbookFixture().toBuffer();
let root:string;
let runtimes:CollectorRuntime[]=[];
const originalFetch=globalThis.fetch;

beforeEach(()=>{root=fs.mkdtempSync(path.join(os.tmpdir(),'erp-collector-test-'));runtimes=[];});
afterEach(async()=>{
  globalThis.fetch=originalFetch;
  for(const runtime of runtimes)await runtime.stop();
  const resolved=path.resolve(root);
  if(!resolved.startsWith(path.join(os.tmpdir(),'erp-collector-test-')))throw new Error('Unexpected test cleanup path');
  fs.rmSync(resolved,{recursive:true,force:true});
});

function createRuntime(directory:string, imports?:ConstructorParameters<typeof CollectorRuntime>[1]) {
  const runtime=new CollectorRuntime(loadConfig(directory),imports);runtimes.push(runtime);return runtime;
}
async function bind(runtime:CollectorRuntime) {
  const connection=await runtime.request<{connectionId:string}>('/api/erp/connections',{method:'POST',body:{accountKey,name:'MY 店'}});
  await runtime.request('/api/erp/bind-shop',{method:'POST',body:{site:'MY',shopId:'12345678',connectionId:connection.connectionId,name:'MY 店'}});
  await runtime.request(`/api/erp/connections/${connection.connectionId}/manual`,{method:'POST',body:{
    cookies:[{name:'SPC_ST',value:'synthetic-cookie',domain:'.seller.shopee.cn',path:'/',secure:true},
      {name:'SPC_CDS',value:'old-cookie-cds',domain:'.seller.shopee.cn',path:'/'}],spcCds:'manual-cds'}});
  return connection.connectionId;
}
function batch(runtime:CollectorRuntime, connectionId:string) {
  return runtime.request<{batchId:number;taskIds:number[]}>('/api/erp/batches',{method:'POST',body:{
    erpRunId:runId,site:'MY',shopId:'12345678',connectionId,from:'2026-09-28',to:'2026-09-28'}});
}

test('ERP directly exports, downloads and imports without a collector HTTP service or identity request',async()=>{
  const accept=jest.fn(async()=>({status:202,body:{importId:'erp-import-1',dedup:false}}));
  const find=jest.fn(async()=>({status:'IMPORTED',rowCount:97,error:null}));
  const runtime=createRuntime(path.join(root,'erp-data'),{imports:{accept,find}});
  const connectionId=await bind(runtime);
  const created=await batch(runtime,connectionId);
  const workbook=fixture();
  const responses=[
    new Response(JSON.stringify({code:0,data:{report_id:42,status:1}})),
    new Response(JSON.stringify({code:0,data:{report_id:42,status:2}})),
    new Response(workbook as unknown as BodyInit),
  ];
  const fetchMock=jest.fn(async()=>{const response=responses.shift();if(!response)throw new Error('Unexpected HTTP request');return response;});
  globalThis.fetch=fetchMock as unknown as typeof fetch;
  const submit=runtime.queue.claimNext(runtime.workerId,Date.now())!;
  await runtime.pipeline.run(submit);
  expect(runtime.queue.getTask(submit.id)?.status).toBe(TaskStatus.WAITING_GENERATION);
  await runtime.pipeline.run(runtime.queue.claimNext(runtime.workerId,Date.now())!);
  const task=runtime.queue.getTask(submit.id)!;
  expect(task.status).toBe(TaskStatus.IMPORTED);
  expect(task.file_rows).toBe(97);
  expect(task.import_ref).toBe('erp-import-1');
  expect(task.file_path?.startsWith(runtime.cfg.downloadDir)).toBe(true);
  const calls=fetchMock.mock.calls as unknown as [URL,RequestInit][];
  expect(calls.map(([url])=>new URL(url).pathname)).toEqual([
    '/api/mydata/cnsc/shop/v3/product/performance/export/',
    '/api/v3/settings/get_report/',
    '/api/v3/settings/download_report/',
  ]);
  expect(new URL(calls[0][0]).searchParams.get('SPC_CDS')).toBe('manual-cds');
  expect(new URL(calls[0][0]).searchParams.get('cnsc_shop_id')).toBe('12345678');
  expect(new Headers(calls[0][1].headers).get('cookie')).toContain('SPC_ST=synthetic-cookie');
  expect(accept).toHaveBeenCalledWith(task.file_path,expect.objectContaining({erpRunId:runId,site:'my',shopId:'12345678'}),
    `real:${runId}:my|12345678|product_performance|2026-09-28:${task.file_checksum}`);
  expect((await runtime.request<{batchId:number}>('/api/erp/batches/by-run/'+runId)).batchId).toBe(created.batchId);
  expect(runtime.reportFile(created.batchId,task.id).file_path).toBe(task.file_path);
  expect(()=>runtime.reportFile(created.batchId+1,task.id)).toThrow('批次报表不存在');
  fs.writeFileSync(task.file_path!,'corrupted');
  expect(()=>runtime.reportFile(created.batchId,task.id)).toThrow('批次报表文件不可用');
});

test('ERP keeps credential isolation and supports pause, resume, cancel and retry',async()=>{
  const runtime=createRuntime(path.join(root,'erp-data'));
  const connectionId=await bind(runtime);
  const created=await batch(runtime,connectionId);
  for(const [action,status] of [['pause',TaskStatus.PAUSED],['resume',TaskStatus.PENDING],['cancel',TaskStatus.FAILED],['retry',TaskStatus.PENDING]]) {
    await runtime.request(`/api/erp/batches/${created.batchId}/${action}`,{method:'POST'});
    expect(runtime.queue.getTask(created.taskIds[0])?.status).toBe(status);
  }
  const other=await runtime.request<{connectionId:string}>('/api/erp/connections',{method:'POST',body:{accountKey:'erp-'+crypto.randomUUID(),name:'Other'}});
  await expect(runtime.request('/api/erp/bind-shop',{method:'POST',body:{site:'MY',shopId:'12345678',connectionId:other.connectionId}})).rejects.toThrow('已绑定其他凭据');
  expect(fs.readFileSync(runtime.cfg.dbPath).includes(Buffer.from('synthetic-cookie'))).toBe(false);
});

test('migration preserves credentials, IDs, imported counts and original workbook checksums, rebasing paths into ERP',async()=>{
  const source=createRuntime(path.join(root,'legacy'));
  const connectionId=await bind(source);
  const created=await batch(source,connectionId);
  const file=path.join(source.cfg.downloadDir,'my_12345678_product_performance_20260928.xlsx');
  fs.writeFileSync(file,fixture());
  const checksum=checksumOf(file), taskId=created.taskIds[0];
  source.queue.updateFields(taskId,{file_path:file,file_checksum:checksum,file_rows:97,import_ref:'existing-import'});
  source.queue.updateStatus(taskId,TaskStatus.IMPORTED);
  source.db.prepare('INSERT INTO downloads(task_id,revision,file_path,checksum,rows,format,worksheets,size_bytes,created_at) VALUES(?,1,?,?,97,\'xlsx\',1,?,?)')
    .run(taskId,file,checksum,fs.statSync(file).size,new Date().toISOString());
  const target=path.join(root,'erp-data');
  expect(migrateCollectorData(source.cfg.dataDir,target)).toEqual({tasks:1,credentials:1,reports:1});
  const migrated=createRuntime(target);
  const report=migrated.reportFile(created.batchId,taskId);
  expect(report.file_rows).toBe(97);
  expect(report.import_ref).toBe('existing-import');
  expect(report.file_path).toBe(path.join(target,'downloads',path.basename(file)));
  expect(checksumOf(report.file_path!)).toBe(checksum);
  expect(migrated.credentials.get(accountKey)).toEqual(source.credentials.get(accountKey));
  expect(await migrated.request(`/api/erp/connections/${connectionId}`)).toMatchObject({connectionId});
  expect(fs.existsSync(file)).toBe(true);
  expect(source.worker.isPaused()).toBe(true);
  expect(migrated.worker.isPaused()).toBe(false);
  expect(()=>migrateCollectorData(source.cfg.dataDir,target)).toThrow('拒绝覆盖');
});

test('migration does not copy an active queue or leave its pause state changed after failure',async()=>{
  const source=createRuntime(path.join(root,'legacy'));
  await batch(source,await bind(source));
  source.queue.claimNext(source.workerId,Date.now());
  expect(()=>migrateCollectorData(source.cfg.dataDir,path.join(root,'target'))).toThrow('执行中的任务');
  expect(source.worker.isPaused()).toBe(false);
  expect(fs.existsSync(path.join(root,'target'))).toBe(false);
});

test('shared credentials apply across existing and new shop connections, with user isolation and restart persistence',async()=>{
  const directory=path.join(root,'erp-data');
  const runtime=createRuntime(directory);
  const first=await bind(runtime);
  const secondKey='erp-'+crypto.randomUUID();
  const second=await runtime.request<{connectionId:string}>('/api/erp/connections',{method:'POST',body:{accountKey:secondKey,name:'PH 店'}});
  await runtime.request('/api/erp/bind-shop',{method:'POST',body:{site:'PH',shopId:'87654321',connectionId:second.connectionId}});
  const scopeKey='erp-user:user-a';
  const migrated=await runtime.request<any>('/api/erp/shared-credentials',{body:{scopeKey,accountKeys:[accountKey,secondKey]}});
  expect(migrated.spcCds).toBe('manual-cds');
  expect(runtime.credentials.get(secondKey)).toEqual(runtime.credentials.get(accountKey));
  await runtime.request('/api/erp/shared-credentials',{method:'POST',body:{scopeKey,accountKeys:[accountKey,secondKey],
    cookies:[{name:'SPC_ST',value:'renewed-session',domain:'.seller.shopee.cn',path:'/'}],spcCds:'renewed-cds'}});
  const task=await runtime.request<any>('/api/erp/batches',{method:'POST',body:{erpRunId:crypto.randomUUID(),site:'PH',shopId:'87654321',
    connectionId:second.connectionId,from:'2026-09-28',to:'2026-09-28'}});
  expect(task.taskIds).toHaveLength(1);
  expect(runtime.credentials.get(accountKey)?.spcCds).toBe('renewed-cds');
  runtime.credentials.markInvalid(accountKey,'Login expired');
  expect(runtime.credentials.view(secondKey).status).toBe('invalid');
  const firstBatch=await batch(runtime,first).catch(()=>null);
  expect(firstBatch).toBeNull();
  runtime.queue.updateStatus(task.taskIds[0],TaskStatus.WAITING_AUTH);
  await runtime.request('/api/erp/shared-credentials',{method:'POST',body:{scopeKey,accountKeys:[accountKey,secondKey],
    cookies:[{name:'SPC_ST',value:'latest-session',domain:'.seller.shopee.cn',path:'/'}],spcCds:'latest-cds'}});
  expect(runtime.credentials.view(secondKey).status).toBe('pending');
  expect(runtime.queue.getTask(task.taskIds[0])?.status).toBe(TaskStatus.PENDING);
  runtime.credentials.markValid(secondKey);
  expect(runtime.credentials.view(accountKey).status).toBe('valid');
  const newKey='erp-'+crypto.randomUUID();
  const third=await runtime.request<any>('/api/erp/connections',{method:'POST',body:{accountKey:newKey,name:'New',credentialScopeKey:scopeKey}});
  expect((await runtime.request<any>(`/api/erp/connections/${third.connectionId}`)).credential.status).toBe('valid');
  expect(runtime.credentials.get(newKey)?.spcCds).toBe('latest-cds');
  const otherKey='erp-'+crypto.randomUUID();
  await runtime.request('/api/erp/connections',{method:'POST',body:{accountKey:otherKey,name:'Other',credentialScopeKey:'erp-user:user-b'}});
  expect(runtime.credentials.get(otherKey)).toBeNull();
  await expect(runtime.request('/api/erp/shared-credentials',{body:{scopeKey:'erp-user:user-b',accountKeys:[accountKey]}})).rejects.toThrow('其他账号');
  expect(fs.readFileSync(runtime.cfg.dbPath).includes(Buffer.from('latest-session'))).toBe(false);
  await runtime.stop();runtimes=runtimes.filter(item=>item!==runtime);
  const restored=createRuntime(directory);
  expect(restored.credentials.get(secondKey)?.spcCds).toBe('latest-cds');
  expect(restored.credentials.get(otherKey)).toBeNull();
});

test('invalid shared credentials return 400 and preserve the encrypted credentials already saved',async()=>{
  const runtime=createRuntime(path.join(root,'erp-data'));
  await bind(runtime);
  const scopeKey='erp-user:user-a';
  await runtime.request('/api/erp/shared-credentials',{body:{scopeKey,accountKeys:[accountKey]}});
  const previous=runtime.credentials.get(accountKey);
  const inputs=[
    {cookies:[{name:'SPC_ST',value:'test',domain:'invalid.example'}],spcCds:'cds'},
    {cookies:[{name:'SPC_ST',value:'bad;value',domain:'.shopee.cn'}],spcCds:'cds'},
    {cookies:[{name:'SPC_ST',value:42,domain:'.shopee.cn'}],spcCds:'cds'},
    {cookies:[{name:'SPC_ST',value:'test',domain:'.shopee.cn'}],spcCds:'bad\r\ncds'},
    {cookies:[{name:'SPC_ST',value:'test',domain:'.shopee.cn'}],spcCds:'x'.repeat(4097)},
    {cookies:[],spcCds:'cds'},
  ];
  for(const input of inputs){
    await expect(runtime.request('/api/erp/shared-credentials',{method:'POST',body:{scopeKey,accountKeys:[accountKey],...input}}))
      .rejects.toMatchObject({name:CredentialInputError.name,status:400});
    expect(runtime.credentials.get(accountKey)).toEqual(previous);
  }
});
