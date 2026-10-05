jest.mock('../../infrastructure/runtimeResources',()=>({prisma:{$transaction:jest.fn(),productAnalysisDailyUpload:{findFirst:jest.fn(),updateMany:jest.fn(),create:jest.fn()},usageEvent:{create:jest.fn()}}}));
import {prisma} from '../../infrastructure/runtimeResources';
import {ingestDailyReport} from '../productAnalysisDailyIngest';
import {validateDailyUploadPayload} from '../productAnalysisUpload';

const db=prisma as any;
const parsed={fileName:'product_performance_20261002.xlsx',currency:'PHP',warnings:[],
  sheets:[{sheetKey:'hot',items:[{itemId:'10001',itemName:'Keyboard',visitors:100}]}],
  sourceSheets:[{sheetIndex:0,sheetName:'热销商品',category:'hot',range:'A1:A2',headerRowNumber:1,rowCount:2,columnCount:1,
    rows:[{rowNumber:1,cells:[{column:1,type:'string',value:'商品编号'}]},{rowNumber:2,cells:[{column:1,type:'string',value:'10001'}]}]}]};
const validated=validateDailyUploadPayload(parsed);
if(!validated.ok)throw new Error(validated.detail);
const input={shop:{id:'shop-a',currency:'PHP'},date:'2026-10-02',payload:validated.value,actor:{id:'user-a',username:'owner',role:'owner'}};
beforeEach(()=>{
  jest.resetAllMocks();db.$transaction.mockImplementation((work:any)=>work(db));
  db.productAnalysisDailyUpload.create.mockResolvedValue({id:'new-upload',version:2});
});

test('an existing different report wins when a missing-only import arrives',async()=>{
  db.productAnalysisDailyUpload.findFirst.mockResolvedValue({id:'existing',version:1,sourceHash:'different',itemCount:7});
  const result=await ingestDailyReport({...input,onlyIfChanged:true,onlyIfMissing:true});
  expect(result).toEqual(expect.objectContaining({uploadId:'existing',version:1,itemCount:7,unchanged:true}));
  expect(db.productAnalysisDailyUpload.create).not.toHaveBeenCalled();
  expect(db.productAnalysisDailyUpload.updateMany).not.toHaveBeenCalled();
});

test('manual force collection can create a new version',async()=>{
  db.productAnalysisDailyUpload.findFirst.mockResolvedValue({id:'existing',version:1,sourceHash:'different',itemCount:7});
  const result=await ingestDailyReport({...input,onlyIfChanged:true,onlyIfMissing:false});
  expect(result.uploadId).toBe('new-upload');
  expect(db.productAnalysisDailyUpload.updateMany).toHaveBeenCalled();
});

test('serializable conflict rechecks data inserted by a concurrent manual upload',async()=>{
  db.$transaction.mockRejectedValueOnce(Object.assign(new Error('conflict'),{code:'P2034'}));
  db.productAnalysisDailyUpload.findFirst.mockResolvedValue({id:'manual',version:1,sourceHash:'other',itemCount:3});
  const result=await ingestDailyReport({...input,onlyIfMissing:true});
  expect(result.uploadId).toBe('manual');
  expect(db.$transaction).toHaveBeenCalledTimes(2);
  expect(db.productAnalysisDailyUpload.create).not.toHaveBeenCalled();
});
