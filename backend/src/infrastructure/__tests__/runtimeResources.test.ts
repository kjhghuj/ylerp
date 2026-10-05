import { EventEmitter } from 'node:events';

const db = { $disconnect: jest.fn().mockResolvedValue(undefined) };
const cache = Object.assign(new EventEmitter(), {
  status: 'wait',
  get: jest.fn(), set: jest.fn(), del: jest.fn(),
  connect: jest.fn(), quit: jest.fn(), disconnect: jest.fn(),
});
jest.mock('@prisma/client', () => ({ PrismaClient: jest.fn(() => db) }));
jest.mock('ioredis', () => jest.fn(() => cache));

import Redis from 'ioredis';
import { closeRuntimeResources, initializeRuntimeResources, prisma, safeRedis } from '../runtimeResources';

const importConnectionCalls = cache.connect.mock.calls.length;
const importRedisOptions = (Redis as unknown as jest.Mock).mock.calls[0]?.[1];

beforeEach(() => {
  jest.clearAllMocks();
  cache.status = 'wait';
  cache.emit('end');
  cache.connect.mockImplementation(async () => { cache.status = 'connecting'; });
  db.$disconnect.mockResolvedValue(undefined);
});

test('importing resources creates a shared database without starting a cache connection', () => {
  expect(prisma).toBe(db);
  expect(importConnectionCalls).toBe(0);
  expect(importRedisOptions).toMatchObject({ lazyConnect: true });
});

test('a stalled cache QUIT is bounded and does not postpone disconnecting the database', async () => {
  jest.useFakeTimers();
  try {
    cache.status = 'ready';
    cache.quit.mockImplementationOnce(() => new Promise(() => {}));
    const pending = closeRuntimeResources();
    expect(db.$disconnect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1000);
    await pending;
    expect(cache.disconnect).toHaveBeenCalledTimes(1);
  } finally { jest.useRealTimers(); }
});

test('cache connection starts explicitly and only once while it is connecting', () => {
  initializeRuntimeResources();
  initializeRuntimeResources();
  expect(cache.connect).toHaveBeenCalledTimes(1);
});

test('unavailable cache falls back without queueing requests', async () => {
  expect(await safeRedis.get('missing')).toBeNull();
  await safeRedis.set('key', 'value', 'EX', 60);
  await safeRedis.del('key');
  expect(cache.get).not.toHaveBeenCalled();
  expect(cache.set).not.toHaveBeenCalled();
  expect(cache.del).not.toHaveBeenCalled();
});

test('ready cache uses TTL options and tolerates failed reads and writes', async () => {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  cache.emit('ready');
  cache.get.mockResolvedValueOnce('cached').mockRejectedValueOnce(new Error('offline'));
  cache.set.mockRejectedValueOnce(new Error('offline'));
  expect(await safeRedis.get('key')).toBe('cached');
  expect(await safeRedis.get('key')).toBeNull();
  await expect(safeRedis.set('key', 'value', 'EX', 60)).resolves.toBeUndefined();
  expect(cache.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);
  log.mockRestore();
});

test('close disconnects an unready cache without queueing QUIT and closes the database', async () => {
  await closeRuntimeResources();
  expect(cache.quit).not.toHaveBeenCalled();
  expect(cache.disconnect).toHaveBeenCalledTimes(1);
  expect(db.$disconnect).toHaveBeenCalledTimes(1);
});

test('close sends QUIT to a ready cache and disconnects if QUIT fails', async () => {
  cache.status = 'ready';
  cache.quit.mockRejectedValueOnce(new Error('already offline'));
  await closeRuntimeResources();
  expect(cache.quit).toHaveBeenCalledTimes(1);
  expect(cache.disconnect).toHaveBeenCalledTimes(1);
  expect(db.$disconnect).toHaveBeenCalledTimes(1);
});
