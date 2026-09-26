import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {Router, type Request, type Response} from 'express';
import multer from 'multer';
import {prisma} from '../index';
import {parseProductAnalysisWorkbook} from '../../../shared/productAnalysis/excelParser';
import {isValidCalendarDate, validateDailyUploadPayload} from '../services/productAnalysisUpload';
import {DailyIngestError, ingestDailyReport} from '../services/productAnalysisDailyIngest';
import {collectorRequest} from '../services/productAnalysisCollectorClient';

const router=Router();
const spool=path.resolve(process.env.PRODUCT_ANALYSIS_IMPORT_DIR||path.join(process.cwd(),'import-spool'));
fs.mkdirSync(spool,{recursive:true});
const upload=multer({dest:spool,limits:{fileSize:25*1024*1024,files:1,fields:20}});

router.use((req,res,next)=>{
  const expected=process.env.ERP_IMPORT_SERVICE_TOKEN||'';
  const actual=(req.headers.authorization||'').replace(/^Bearer /,'');
  const a=Buffer.from(actual),b=Buffer.from(expected);
  if(!expected||a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(401).json({detail:'Unauthorized'});
  next();
});

function reply(row:{id:string;status:string;rowCount:number|null;error:string|null},dedup=false){
  return {ok:true,importId:row.id,status:row.status,rowCount:row.rowCount,error:row.error,dedup};
}
async function discard(file?:Express.Multer.File){if(file)await fs.promises.unlink(file.path).catch(()=>{});}

router.post('/',upload.single('file'),async(req:Request,res:Response)=>{
  const file=req.file;
  const fail=async(status:number,detail:string)=>{await discard(file);return res.status(status).json({ok:false,error:detail});};
  if(!file)return res.status(400).json({ok:false,error:'缺少报表文件'});
  const m=req.body as Record<string,string>;
  if(['mode','reportType','erpRunId','reportDate','checksum','taskId','fileName','site','shopId']
    .some(key=>typeof m[key]!=='string'))return fail(400,'报表字段格式无效');
  const runId=m.erpRunId||'',date=m.reportDate||'',checksum=m.checksum||'';
  const idem=String(req.header('X-Idempotency-Key')||'');
  if(m.mode!=='real'||m.reportType!=='product_performance'||!isValidCalendarDate(date)||
    !/^[a-f0-9]{64}$/i.test(checksum)||!/^[0-9a-f-]{36}$/i.test(runId)||
    !/^[0-9]+$/.test(m.taskId||'')||!/^.*\.xlsx?$/i.test(m.fileName||'')||
    m.fileName.length>255) return fail(400,'报表元数据无效');
  const expected=`real:${runId}:${m.site}|${m.shopId}|product_performance|${date}:${checksum}`;
  if(idem!==expected)return fail(409,'幂等键与任务、日期或校验和不匹配');
  const run=await prisma.productAnalysisCollectionRun.findUnique({where:{id:runId},include:{shop:{include:{collectorBinding:true}},user:true}});
  const binding=run?.shop.collectorBinding;
  if(!run||!binding||run.status==='CANCELLED'||binding.site.toLowerCase()!==m.site||
    binding.shopeeShopId!==m.shopId||run.shopId!==binding.shopId||
    date<run.fromDate.toISOString().slice(0,10)||date>run.toDate.toISOString().slice(0,10))
    return fail(403,'店铺绑定、采集任务或日期不匹配');
  const actual=crypto.createHash('sha256').update(await fs.promises.readFile(file.path)).digest('hex');
  if(actual!==checksum.toLowerCase())return fail(422,'文件校验和不匹配');
  try {
    let batchId=run.collectorBatchId;
    if(!batchId){
      const found=await collectorRequest<{batchId:number}>(`/api/erp/batches/by-run/${run.id}`);
      batchId=found.batchId;
      await prisma.productAnalysisCollectionRun.update({where:{id:run.id},data:{collectorBatchId:batchId,status:'ACTIVE'}});
    }
    const task=await collectorRequest<{erpRunId:string;site:string;shopId:string;reportDate:string;checksum:string}>(
      `/api/erp/batches/${batchId}/tasks/${m.taskId}/file`);
    if(task.erpRunId!==run.id||task.site!==m.site||task.shopId!==m.shopId||
      task.reportDate!==date||task.checksum.toLowerCase()!==actual)
      return fail(403,'采集任务或原文件与上传内容不匹配');
  }catch(error){
    await discard(file);
    return res.status(502).json({ok:false,error:error instanceof Error?error.message:'无法核对采集任务'});
  }
  const old=await prisma.productAnalysisCollectorImport.findUnique({where:{idempotencyKey:idem}});
  if(old){
    if(old.runId!==run.id||old.shopId!==run.shopId||old.checksum!==checksum)return fail(409,'幂等键冲突');
    if(old.status==='FAILED'){
      const retried=await prisma.productAnalysisCollectorImport.update({where:{id:old.id},
        data:{status:'PENDING',error:null,filePath:file.path,fileName:m.fileName}});
      if(old.filePath!==file.path)await fs.promises.unlink(old.filePath).catch(()=>{});
      return res.status(202).json(reply(retried,true));
    }
    await discard(file);
    return res.status(old.status==='IMPORTED'?200:202).json(reply(old,true));
  }
  try {
    const row=await prisma.productAnalysisCollectorImport.create({data:{runId:run.id,shopId:run.shopId,
      userId:run.userId,reportDate:new Date(`${date}T00:00:00Z`),checksum:checksum.toLowerCase(),
      idempotencyKey:idem,filePath:file.path,fileName:m.fileName,status:'PENDING'}});
    return res.status(202).json(reply(row));
  }catch(error){
    await discard(file);
    const raced=await prisma.productAnalysisCollectorImport.findUnique({where:{idempotencyKey:idem}});
    if(raced&&raced.runId===run.id&&raced.shopId===run.shopId&&raced.checksum===checksum)
      return res.status(raced.status==='IMPORTED'?200:202).json(reply(raced,true));
    return res.status(409).json({ok:false,error:'重复导入请求'});
  }
});

router.get('/',async(req,res)=>{
  const key=String(req.query.idempotencyKey||'');
  const row=await prisma.productAnalysisCollectorImport.findUnique({where:{idempotencyKey:key}});
  if(!row)return res.status(404).json({ok:false,error:'Import not found'});
  return res.json(reply(row));
});
router.get('/:id',async(req,res)=>{
  const row=await prisma.productAnalysisCollectorImport.findUnique({where:{id:String(req.params.id)}});
  if(!row)return res.status(404).json({ok:false,error:'Import not found'});
  return res.json(reply(row));
});
router.use((error:Error, _req:Request,res:Response,_next:unknown)=>{
  if(error instanceof multer.MulterError)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({ok:false,error:error.message});
  return res.status(400).json({ok:false,error:'文件上传失败'});
});

let processing=false;
export function startProductAnalysisImportWorker(){
  void prisma.productAnalysisCollectorImport.updateMany({where:{status:'PROCESSING'},data:{status:'PENDING'}})
    .catch(error=>console.error('Import recovery error:',error));
  const timer=setInterval(()=>void tick(),2_000);timer.unref();
}
async function tick(){
  if(processing)return;
  processing=true;
  try {
    const row=await prisma.productAnalysisCollectorImport.findFirst({where:{status:'PENDING'},orderBy:{createdAt:'asc'}});
    if(!row)return;
    const claim=await prisma.productAnalysisCollectorImport.updateMany({where:{id:row.id,status:'PENDING'},data:{status:'PROCESSING'}});
    if(claim.count!==1)return;
    try {
      const run=await prisma.productAnalysisCollectionRun.findUnique({where:{id:row.runId},include:{shop:{include:{collectorBinding:true}},user:true}});
      if(!run||run.status==='CANCELLED'||!run.shop.collectorBinding||run.shopId!==row.shopId||run.userId!==row.userId)
        throw new DailyIngestError('导入任务与店铺绑定不匹配');
      const bytes=await fs.promises.readFile(row.filePath);
      if(bytes.length>25*1024*1024||crypto.createHash('sha256').update(bytes).digest('hex')!==row.checksum)
        throw new DailyIngestError('文件大小或校验和不匹配');
      const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
      const parsed=parseProductAnalysisWorkbook(buffer,row.fileName);
      const validated=validateDailyUploadPayload(parsed);
      if(!validated.ok)throw new DailyIngestError(validated.detail);
      const result=await ingestDailyReport({shop:run.shop,date:row.reportDate.toISOString().slice(0,10),
        payload:validated.value,actor:{id:run.user.id,username:run.user.username,role:run.user.role},onlyIfChanged:true});
      await prisma.productAnalysisCollectorImport.update({where:{id:row.id},data:{status:'IMPORTED',
        rowCount:result.itemCount,uploadId:result.uploadId,error:null}});
    }catch(error){
      await prisma.productAnalysisCollectorImport.update({where:{id:row.id},data:{status:'FAILED',
        error:error instanceof Error?error.message.slice(0,500):'导入失败'}});
    }
  }catch(error){console.error('Import worker error:',error);}finally{processing=false;}
}

export default router;
