jest.mock('../../infrastructure/runtimeResources', () => ({ prisma: {
  productAnalysisCollectorImport: { updateMany: jest.fn(), findFirst: jest.fn() },
} }));
import { prisma } from '../../infrastructure/runtimeResources';
import { startProductAnalysisImportWorker } from '../productAnalysisImportService';

const imports = prisma.productAnalysisCollectorImport;
describe('collector import worker lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers(); jest.resetAllMocks();
    (imports.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (imports.findFirst as jest.Mock).mockResolvedValue(null);
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('waits for recovery before claiming work and drains recovery when stopped', async () => {
    let recovered!: () => void;
    (imports.updateMany as jest.Mock).mockImplementation(() => new Promise<void>(resolve => { recovered = resolve; }));
    const worker = startProductAnalysisImportWorker();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(imports.findFirst).not.toHaveBeenCalled();
    worker.stop();
    const done = jest.fn();
    const drain = worker.drain().then(done);
    await Promise.resolve(); expect(done).not.toHaveBeenCalled();
    recovered(); await drain;
    // The tick already started before stop may finish; later ticks must not start.
    expect(imports.findFirst).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(4_000);
    expect(imports.findFirst).toHaveBeenCalledTimes(1);
  });

  it('keeps the existing first tick delay and prevents overlapping claims', async () => {
    let complete!: () => void;
    (imports.findFirst as jest.Mock).mockImplementationOnce(() => new Promise<null>(resolve => { complete = () => resolve(null); }));
    const worker = startProductAnalysisImportWorker();
    await jest.advanceTimersByTimeAsync(1_999); expect(imports.findFirst).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(4_001); expect(imports.findFirst).toHaveBeenCalledTimes(1);
    complete(); await jest.advanceTimersByTimeAsync(0);
    await jest.advanceTimersByTimeAsync(2_000); expect(imports.findFirst).toHaveBeenCalledTimes(2);
    worker.stop(); await worker.drain();
  });

  it('can stop before its first tick while awaiting the initial recovery', async () => {
    const worker = startProductAnalysisImportWorker();
    worker.stop(); await worker.drain();
    await jest.advanceTimersByTimeAsync(4_000);
    expect(imports.updateMany).toHaveBeenCalledTimes(1);
    expect(imports.findFirst).not.toHaveBeenCalled();
  });
});
