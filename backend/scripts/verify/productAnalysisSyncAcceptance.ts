/** Local HTTP + PostgreSQL acceptance using disposable accounts and no bound Shopee shops. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import bcrypt from 'bcrypt';
import {PrismaClient} from '@prisma/client';
import {loadConfig} from '../../src/collector/config';

const api=process.env.AUDIT_API||'http://127.0.0.1:4022/api';
const local=new Set(['localhost','127.0.0.1','[::1]']);
assert.ok(local.has(new URL(api).hostname)&&local.has(new URL(process.env.DATABASE_URL!).hostname),'Acceptance requires localhost API and database');
const db=new PrismaClient();
const users:string[]=[];
async function request(path:string,token='',body?:unknown,status=200){
  const response=await fetch(`${api}${path}`,{method:body===undefined?'GET':'POST',
    headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},
    body:body===undefined?undefined:JSON.stringify(body)});
  assert.equal(response.status,status,`Unexpected response for ${path}`);
  return response.json();
}
async function account(){
  const username=`backfill-acceptance-${randomUUID()}`,password=randomUUID();
  const user=await db.user.create({data:{username,password:await bcrypt.hash(password,10),displayName:'同步验收测试账号',
    role:'staff',permissions:['product-analysis','product-analysis.upload']}});
  users.push(user.id);
  const login=await request('/auth/login','',{username,password});
  return {id:user.id,token:login.token as string};
}
async function main(){
  const a=await account(),b=await account();
  await db.productAnalysisShop.createMany({data:['PH','MY','TH'].map(site=>({userId:a.id,name:`同步验收 ${site}`,site,currency:site==='PH'?'PHP':site==='MY'?'MYR':'THB'}))});
  assert.equal((await request('/product-analysis/collector-sync-status',a.token)).lastPluginSyncedAt,null);
  const payload={cookies:[{name:'SPC_ST',value:'synthetic-acceptance-cookie',domain:'.seller.shopee.cn',path:'/',secure:true}],spcCds:'synthetic-acceptance-cds'};
  const first=await request('/product-analysis/collector-credentials',a.token,payload);
  assert.equal(first.ok,true);
  const second=await request('/product-analysis/collector-credentials',a.token,payload);
  assert.ok(Date.parse(second.syncedAt)>=Date.parse(first.syncedAt));
  assert.equal((await db.productAnalysisCollectionSync.findUniqueOrThrow({where:{userId:a.id}})).revision,2);
  const status=await request('/product-analysis/collector-sync-status',a.token);
  assert.equal(status.syncedToday,true);assert.equal(status.lastPluginSyncedAt,second.syncedAt);assert.equal(status.shops.length,3);
  assert.ok(!JSON.stringify(status).match(/cookies|spcCds|synthetic-acceptance/));
  for(const shop of status.shops)assert.equal((Date.parse(shop.to)-Date.parse(shop.from))/86400000+1,30);
  await request('/product-analysis/collector-credentials',a.token,{...payload,source:'manual'});
  assert.equal((await request('/product-analysis/collector-sync-status',a.token)).lastPluginSyncedAt,second.syncedAt);
  const isolated=await request('/product-analysis/collector-sync-status',b.token);
  assert.equal(isolated.lastPluginSyncedAt,null);assert.deepEqual(isolated.shops,[]);
  const deadline=Date.now()+12_000;
  let shops=status.shops;
  while(shops.some((shop:{status:string})=>shop.status==='PENDING')&&Date.now()<deadline){
    await new Promise(resolve=>setTimeout(resolve,300));
    shops=(await request('/product-analysis/collector-sync-status',a.token)).shops;
  }
  assert.deepEqual(shops.map((shop:{status:string})=>shop.status).sort(),['NEEDS_BINDING','NEEDS_BINDING','UNSUPPORTED']);
  assert.equal(await db.productAnalysisCollectionRun.count({where:{userId:a.id}}),0,'Unbound shops must never contact Shopee');
  await db.user.update({where:{id:a.id},data:{permissions:[]}});
  await request('/product-analysis/collector-sync-status',a.token,undefined,403);
  console.log('PASS: persisted plugin timestamps, repeated uploads, 30-day bounds, manual-save isolation, account isolation, background scans and revoked permissions');
}
main().finally(async()=>{
  // Only the exact disposable IDs created by this invocation are removed.
  await db.usageEvent.deleteMany({where:{actorId:{in:users}}});
  await db.user.deleteMany({where:{id:{in:users}}});
  const cfg=loadConfig();
  if(existsSync(cfg.dbPath)){
    const collector=new DatabaseSync(cfg.dbPath);
    try{for(const id of users)collector.prepare('DELETE FROM account_credentials WHERE account_key=?').run(`erp-user:${id}`);}
    finally{collector.close();}
  }
  await db.$disconnect();
}).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
