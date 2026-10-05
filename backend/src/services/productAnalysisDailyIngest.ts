import { Prisma } from '@prisma/client';
import { prisma } from '../infrastructure/runtimeResources';
import { withUsageEvent } from './usageEvents';
import { SUMMABLE_FIELDS, mapParsedSheetItemsToDailyRows, type DailyItemRow } from './productAnalysisAggregation';
import { hashCanonicalJson } from './productAnalysisSourceHash';
import { isValidCalendarDate, validatePeriodMatchesDate, type ValidatedDailyUploadPayload } from './productAnalysisUpload';

export class DailyIngestError extends Error {}

export async function ingestDailyReport(input: {
  shop: { id: string; currency: string };
  date: string;
  payload: ValidatedDailyUploadPayload;
  actor: { id: string; username: string; role: string };
  onlyIfChanged?: boolean;
  onlyIfMissing?: boolean;
}) {
  const {shop,date,payload,actor} = input;
  if (!isValidCalendarDate(date)) throw new DailyIngestError('日期无效');
  const periodError = validatePeriodMatchesDate(payload.fileName, payload, date);
  if (periodError) throw new DailyIngestError(periodError);
  if (payload.currency !== null && payload.currency !== shop.currency) {
    throw new DailyIngestError(`报表币种 ${payload.currency} 与店铺币种 ${shop.currency} 不一致`);
  }
  const rows = mapParsedSheetItemsToDailyRows(payload.sheets);
  if (!rows.length) throw new DailyIngestError('Report contains no product items');
  const uploadDate = new Date(`${date}T00:00:00.000Z`);
  const sourceHash = hashCanonicalJson(payload.sourceSheets);
  const sourceRowCount = payload.sourceSheets.reduce((total,sheet)=>total+sheet.rows.filter(row=>
    row.cells.length > 0 && (sheet.headerRowNumber === null || row.rowNumber > sheet.headerRowNumber)).length,0);
  const variationCount = rows.reduce((total,row)=>total+(Array.isArray(row.variations)?row.variations.length:0),0);
  const toDailyItemCreate = (row: DailyItemRow): Prisma.ProductDailyItemUncheckedCreateWithoutUploadInput => {
    const data: Prisma.ProductDailyItemUncheckedCreateWithoutUploadInput = {
      itemId: row.itemId, itemName: row.itemName, sheetKey: row.sheetKey, status: row.status ?? null,
      extra: (row.extra ?? undefined) as Prisma.InputJsonValue | undefined,
      variations: (row.variations ?? undefined) as Prisma.InputJsonValue | undefined,
    };
    const loose = row as unknown as Record<string,unknown>;
    for (const field of SUMMABLE_FIELDS) {
      const value = loose[field];
      data[field] = typeof value === 'number' && Number.isFinite(value) ? value : null;
    }
    return data;
  };
  for (let attempt=0;attempt<3;attempt++) {
    try {
      const result = await withUsageEvent(prisma,{user:actor},{
        module:'product-analysis',action:'product_analysis_daily_upload',objectType:'ProductAnalysisDailyUpload',
        affectedCount:rows.length,metadata:{shopId:shop.id,date},
      },async tx=>{
        const latest = await tx.productAnalysisDailyUpload.findFirst({where:{shopId:shop.id,date:uploadDate},
          orderBy:{version:'desc'},select:{version:true,sourceHash:true,id:true}});
        if (input.onlyIfChanged || input.onlyIfMissing) {
          const active=await tx.productAnalysisDailyUpload.findFirst({where:{shopId:shop.id,date:uploadDate,isActive:true},
            select:{id:true,version:true,sourceHash:true,itemCount:true}});
          if(active && (input.onlyIfMissing || active.sourceHash===sourceHash))
            return {uploadId:active.id,version:active.version,unchanged:true,itemCount:active.itemCount};
        }
        const version=(latest?.version??0)+1;
        await tx.productAnalysisDailyUpload.updateMany({where:{shopId:shop.id,date:uploadDate,isActive:true},data:{isActive:false}});
        const created=await tx.productAnalysisDailyUpload.create({data:{
          shopId:shop.id,date:uploadDate,fileName:payload.fileName,currency:shop.currency,itemCount:rows.length,
          warnings:payload.warnings as unknown as object,version,isActive:true,sourceSchemaVersion:1,
          sourceHash,sourceSheetCount:payload.sourceSheets.length,sourceRowCount,sourceComplete:true,userId:actor.id,
          items:{create:rows.map(toDailyItemCreate)},
          sourceSheets:{create:payload.sourceSheets.map(sheet=>({sheetIndex:sheet.sheetIndex,sheetName:sheet.sheetName,
            category:sheet.category,range:sheet.range,headerRowNumber:sheet.headerRowNumber,rowCount:sheet.rowCount,
            columnCount:sheet.columnCount,rows:sheet.rows as unknown as Prisma.InputJsonValue}))},
        },select:{id:true,version:true}});
        return {uploadId:created.id,version:created.version,unchanged:false};
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
      return {...result,date,fileName:payload.fileName,itemCount:result.itemCount??rows.length,derivedItemCount:rows.length,
        variationCount,sourceSheetCount:payload.sourceSheets.length,sourceRowCount,sourceComplete:true,warnings:payload.warnings};
    } catch(error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if(attempt===2 || !['P2034','P2002'].includes(code)) throw error;
    }
  }
  throw new Error('Upload transaction did not return a result');
}
