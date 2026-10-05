import '../config/environment';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

// Business modules depend on these resources, never on the HTTP startup entrypoint.
export const prisma = new PrismaClient();
export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  retryStrategy: () => null,
});

let redisReady = false;
redis.on('connect', () => console.log('Redis TCP connected'));
redis.on('ready', () => { redisReady = true; console.log('Redis ready'); });
redis.on('close', () => { redisReady = false; });
redis.on('end', () => { redisReady = false; });
redis.on('error', (error: Error) => {
  console.warn('Redis error (continuing without cache):', error.message);
});

export const initializeRuntimeResources = (): void => {
  if (redis.status === 'wait') void redis.connect().catch(() => {});
};

export const safeRedis = {
  async get(key: string): Promise<string | null> {
    if (!redisReady) return null;
    try { return await redis.get(key); } catch { return null; }
  },
  async set(key: string, value: string, ...args: (string | number)[]): Promise<void> {
    if (!redisReady) return;
    try { await (redis.set as unknown as (...parameters: (string | number)[]) => Promise<unknown>)(key, value, ...args); } catch {}
  },
  async del(key: string): Promise<void> {
    if (!redisReady) return;
    try { await redis.del(key); } catch {}
  },
};

const closeRedis = async (): Promise<void> => {
  if (redis.status !== 'ready') { redis.disconnect(); return; }
  let timer: NodeJS.Timeout | undefined;
  try {
    // A ready connection can stop responding too; never wait indefinitely for QUIT.
    await Promise.race([
      redis.quit(),
      new Promise<void>(resolve => {
        timer = setTimeout(() => { redis.disconnect(); resolve(); }, 1_000);
      }),
    ]);
  } catch { redis.disconnect(); }
  finally { if (timer) clearTimeout(timer); }
};

export const closeRuntimeResources = async (): Promise<void> => {
  redisReady = false;
  await Promise.all([closeRedis(), prisma.$disconnect()]);
};
