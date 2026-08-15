import fs from 'fs';
import { prisma } from '../../index';
import { startFinanceBackup } from '../financeBackup';

jest.mock('../../index', () => ({
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
});
