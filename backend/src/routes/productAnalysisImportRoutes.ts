import crypto from 'node:crypto';
import {Router,type Request,type Response} from 'express';
import multer from 'multer';
import {prisma} from '../infrastructure/runtimeResources';
import {acceptCollectorImport,importReply,importSpool} from '../services/productAnalysisImportService';
export {startProductAnalysisImportWorker} from '../services/productAnalysisImportService';

const router=Router();
const upload=multer({dest:importSpool,limits:{fileSize:25*1024*1024,files:1,fields:20}});

router.use((req,res,next)=>{
  const expected=process.env.ERP_IMPORT_SERVICE_TOKEN||'';
  const actual=(req.headers.authorization||'').replace(/^Bearer /,'');
  const a=Buffer.from(actual),b=Buffer.from(expected);
  if(!expected||a.length!==b.length||!crypto.timingSafeEqual(a,b)) return res.status(401).json({detail:'Unauthorized'});
  next();
});

router.post('/',upload.single('file'),async(req:Request,res:Response)=>{
  const result=await acceptCollectorImport(req.file,req.body as Record<string,string>,String(req.header('X-Idempotency-Key')||''));
  return res.status(result.status).json(result.body);
});

router.get('/',async(req,res)=>{
  const key=String(req.query.idempotencyKey||'');
  const row=await prisma.productAnalysisCollectorImport.findUnique({where:{idempotencyKey:key}});
  if(!row)return res.status(404).json({ok:false,error:'Import not found'});
  return res.json(importReply(row));
});
router.get('/:id',async(req,res)=>{
  const row=await prisma.productAnalysisCollectorImport.findUnique({where:{id:String(req.params.id)}});
  if(!row)return res.status(404).json({ok:false,error:'Import not found'});
  return res.json(importReply(row));
});
router.use((error:Error, _req:Request,res:Response,_next:unknown)=>{
  if(error instanceof multer.MulterError)return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({ok:false,error:error.message});
  return res.status(400).json({ok:false,error:'文件上传失败'});
});


export default router;
