import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';

jest.mock('../app', () => ({ createApp: jest.fn() }));
jest.mock('../infrastructure/runtimeResources', () => ({
  prisma: {}, redis: {}, safeRedis: {},
  initializeRuntimeResources: jest.fn(), closeRuntimeResources: jest.fn(),
}));
jest.mock('../collector/runtime', () => ({ getCollector: jest.fn(), stopCollector: jest.fn(), stopCollectorClaims: jest.fn() }));
jest.mock('../services/financeBackup', () => ({ startFinanceBackup: jest.fn() }));
jest.mock('../services/shopeeAuthorization', () => ({
  ShopeeAuthorizationService: jest.fn(), startShopeeTokenRefresh: jest.fn(),
}));
jest.mock('../services/productAnalysisImportService', () => ({ startProductAnalysisImportWorker: jest.fn() }));
jest.mock('../services/productAnalysisBackfill', () => ({ startProductAnalysisBackfillWorker: jest.fn() }));
jest.mock('../services/productAnalysisChatHistory', () => ({ startProductChatHistoryCleanup: jest.fn() }));

import { createApp } from '../app';
import { startServer } from '../index';
import { initializeRuntimeResources, closeRuntimeResources } from '../infrastructure/runtimeResources';
import { getCollector, stopCollector } from '../collector/runtime';
import { startFinanceBackup } from '../services/financeBackup';
import { startShopeeTokenRefresh } from '../services/shopeeAuthorization';
import { startProductAnalysisImportWorker } from '../services/productAnalysisImportService';
import { startProductAnalysisBackfillWorker } from '../services/productAnalysisBackfill';
import { startProductChatHistoryCleanup } from '../services/productAnalysisChatHistory';

const workerFactories = [startFinanceBackup, startShopeeTokenRefresh, startProductAnalysisBackfillWorker,
  startProductChatHistoryCleanup, startProductAnalysisImportWorker];

it('importing the startup entrypoint does not bind a port or start workers or connections', () => {
  expect(createApp).not.toHaveBeenCalled();
  expect(getCollector).not.toHaveBeenCalled();
  expect(initializeRuntimeResources).not.toHaveBeenCalled();
  for (const start of workerFactories) expect(start).not.toHaveBeenCalled();
});

describe('explicit server startup', () => {
  let jobs: { stop: jest.Mock; drain: jest.Mock }[];
  let server: Server;
  let listen: jest.Mock;
  beforeEach(() => {
    jest.resetAllMocks();
    jobs = workerFactories.map(start => {
      const job = { stop: jest.fn(), drain: jest.fn().mockResolvedValue(undefined) };
      (start as jest.Mock).mockReturnValue(job);
      return job;
    });
    server = Object.assign(new EventEmitter(), {
      close: jest.fn(callback => callback()), closeAllConnections: jest.fn(),
    }) as unknown as Server;
    listen = jest.fn().mockReturnValue(server);
    (createApp as jest.Mock).mockReturnValue({ listen });
    (stopCollector as jest.Mock).mockResolvedValue(undefined);
    (closeRuntimeResources as jest.Mock).mockResolvedValue(undefined);
  });

  it('starts explicitly and releases workers, resources and process listeners when stopped', async () => {
    const before = process.listenerCount('SIGTERM');
    const running = startServer();
    expect(initializeRuntimeResources).toHaveBeenCalledTimes(1);
    expect(getCollector).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(process.listenerCount('SIGTERM')).toBe(before + 1);
    await running.shutdown();
    expect(process.listenerCount('SIGTERM')).toBe(before);
    expect(closeRuntimeResources).toHaveBeenCalledTimes(1);
    for (const job of jobs) {
      expect(job.stop).toHaveBeenCalledTimes(1);
      expect(job.drain).toHaveBeenCalledTimes(1);
    }
  });

  it('cleans up workers already started if binding HTTP throws synchronously', async () => {
    listen.mockImplementation(() => { throw new Error('invalid port'); });
    expect(() => startServer()).toThrow('invalid port');
    await new Promise<void>(resolve => setImmediate(resolve));
    for (const job of jobs) expect(job.stop).toHaveBeenCalledTimes(1);
    expect(stopCollector).toHaveBeenCalledTimes(1);
    expect(closeRuntimeResources).toHaveBeenCalledTimes(1);
  });
});
