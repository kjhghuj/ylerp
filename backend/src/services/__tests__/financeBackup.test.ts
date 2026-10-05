import fs from 'fs';
import { prisma } from '../../infrastructure/runtimeResources';
import { startFinanceBackup } from '../financeBackup';

jest.mock('../../infrastructure/runtimeResources', () => ({
  prisma: {
    financeRecord: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    existsSync: jest.fn(() => true),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
  },
}));

const findMany = prisma.financeRecord.findMany as jest.Mock;
const writeFileSync = fs.writeFileSync as jest.Mock;

describe('startFinanceBackup', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    findMany.mockResolvedValue([]);
    process.env.FINANCE_BACKUP_STARTUP_DELAY_MS = '1000';
  });

  afterEach(() => {
    delete process.env.FINANCE_BACKUP_STARTUP_DELAY_MS;
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('defers the first backup until the API startup window has passed', async () => {
    startFinanceBackup();

    expect(findMany).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(999);
    expect(findMany).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });

  it('cancels the delayed first backup and future backups on stop', async () => {
    const stop = startFinanceBackup();
    stop();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(findMany).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not start another backup while an earlier one is pending', async () => {
    let complete!: () => void;
    findMany.mockImplementationOnce(() => new Promise<unknown[]>(resolve => { complete = () => resolve([]); }));
    const stop = startFinanceBackup();
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(findMany).toHaveBeenCalledTimes(1);
    stop();
    complete();
    await stop.drain();
    expect(writeFileSync).toHaveBeenCalledTimes(1);
  });
});
