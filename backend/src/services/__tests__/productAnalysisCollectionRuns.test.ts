jest.mock('../../infrastructure/runtimeResources',()=>({prisma:{productAnalysisCollectionRun:{update:jest.fn(),updateMany:jest.fn(),findUnique:jest.fn()}}}));
jest.mock('../productAnalysisCollectorClient',()=>({collectorRequest:jest.fn()}));
import {prisma} from '../../infrastructure/runtimeResources';
import {collectorRequest} from '../productAnalysisCollectorClient';
import {recoverStarting,syncRunStatus} from '../productAnalysisCollectionRuns';

const db=prisma as any;
const run={id:'run-a',status:'ACTIVE',collectorBatchId:1,createdAt:new Date()};
beforeEach(()=>{jest.resetAllMocks();db.productAnalysisCollectionRun.updateMany.mockResolvedValue({count:1});});

test.each(['PAUSED','CANCELLED','FAILED','COMPLETED'])('preserves a %s run when polling',async status=>{
  expect(await syncRunStatus({...run,status})).toBe(status);
  expect(collectorRequest).not.toHaveBeenCalled();
});
test('polling cannot overwrite a concurrent cancellation',async()=>{
  (collectorRequest as jest.Mock).mockResolvedValue({batch:{counts:{IMPORTED:3,SKIPPED:27},total:30}});
  db.productAnalysisCollectionRun.updateMany.mockResolvedValue({count:0});
  db.productAnalysisCollectionRun.findUnique.mockResolvedValue({...run,status:'CANCELLED'});
  expect(await syncRunStatus(run)).toBe('CANCELLED');
});
test('recovers a lost STARTING batch response by ERP run ID',async()=>{
  (collectorRequest as jest.Mock).mockResolvedValue({batchId:5});
  db.productAnalysisCollectionRun.update.mockResolvedValue({...run,collectorBatchId:5});
  expect(await recoverStarting({...run,status:'STARTING',collectorBatchId:null})).toEqual({...run,collectorBatchId:5});
});
test('only confirmed absent, stale STARTING runs are marked failed',async()=>{
  (collectorRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('missing'),{status:404}));
  db.productAnalysisCollectionRun.update.mockResolvedValue({...run,status:'FAILED'});
  await expect(recoverStarting({...run,status:'STARTING',collectorBatchId:null})).rejects.toThrow('missing');
  expect(db.productAnalysisCollectionRun.update).not.toHaveBeenCalled();
  const old={...run,status:'STARTING',collectorBatchId:null,createdAt:new Date(Date.now()-61_000)};
  expect((await recoverStarting(old)).status).toBe('FAILED');
  (collectorRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('service unavailable'),{status:502}));
  await expect(recoverStarting(old)).rejects.toThrow('service unavailable');
});
