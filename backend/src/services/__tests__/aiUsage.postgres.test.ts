import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../infrastructure/runtimeResources', () => ({ prisma: {
  $transaction: jest.fn(), aiUsageCall: { findUnique: jest.fn(), update: jest.fn() },
} }));
import { prisma } from '../../infrastructure/runtimeResources';
import { runAiCall } from '../aiUsage';

const databaseUrl = process.env.USAGE_TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const output = { data: [{ url: 'https://example.com/test-output.png' }] };

integration('PostgreSQL AI quota admission', () => {
  let db: PrismaClient;
  const userIds = [randomUUID(), randomUUID()];
  const previousLimit = process.env.AI_DAILY_CALL_LIMIT;
  const callInput = (userId: string, requestKey: string) => ({
    userId, requestKey, operationId: 'test-operation', kind: 'generation' as const,
    mode: 'edit', model: 'doubao-seedream-4.5', payload: { test: true },
  });

  beforeAll(async () => {
    if (!new URL(databaseUrl!).pathname.includes('test')) throw new Error('Requires an isolated test database');
    db = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    for (const id of userIds) await db.user.create({ data: {
      id, username: `ai-quota-${id}`, displayName: 'AI quota fixture', password: 'test-only', role: 'viewer',
    } });
    (prisma.$transaction as jest.Mock).mockImplementation((callback, options) => db.$transaction(callback, options));
    (prisma.aiUsageCall.findUnique as jest.Mock).mockImplementation(args => db.aiUsageCall.findUnique(args));
    (prisma.aiUsageCall.update as jest.Mock).mockImplementation(args => db.aiUsageCall.update(args));
  });
  beforeEach(() => { process.env.AI_DAILY_CALL_LIMIT = '1'; });
  afterEach(async () => { if (db) await db.aiUsageCall.deleteMany({ where: { userId: { in: userIds } } }); });
  afterAll(async () => {
    if (previousLimit === undefined) delete process.env.AI_DAILY_CALL_LIMIT;
    else process.env.AI_DAILY_CALL_LIMIT = previousLimit;
    if (db) { await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect(); }
  });

  test('simultaneous requests cannot claim the same final daily slot', async () => {
    const provider = jest.fn().mockResolvedValue(output);
    const outcomes = await Promise.allSettled([
      runAiCall(callInput(userIds[0], 'first'), provider),
      runAiCall(callInput(userIds[0], 'second'), provider),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { status_code: 429 } });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await db.aiUsageCall.count({ where: { userId: userIds[0] } })).toBe(1);
  });

  test('another user has independent quota', async () => {
    const provider = jest.fn().mockResolvedValue(output);
    await Promise.all(userIds.map(userId => runAiCall(callInput(userId, 'same-request-key'), provider)));
    expect(provider).toHaveBeenCalledTimes(2);
  });

  test('a confirmed success is replayable after quota exhaustion', async () => {
    const provider = jest.fn().mockResolvedValue(output);
    const input = callInput(userIds[0], 'replay');
    const initial = await runAiCall(input, provider);
    const replay = await runAiCall(input, provider);
    expect(replay.call.id).toBe(initial.call.id);
    expect(replay.result).toEqual(initial.result);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
