jest.mock('../../infrastructure/runtimeResources', () => ({ prisma: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  aiUsageCall: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
} }));
import { prisma } from '../../infrastructure/runtimeResources';
import { runAiCall, aiRequestHash } from '../aiUsage';
import { ApiError } from '../chroma/config';

const db = prisma.aiUsageCall as unknown as Record<string, jest.Mock>;
const transaction = prisma.$transaction as jest.Mock;
const queryRaw = prisma.$queryRaw as jest.Mock;
const input = { userId: 'u1', requestKey: 'request-1', operationId: 'operation-1', mode: 'edit', kind: 'generation' as const, model: 'doubao-seedream-4.5', payload: { image: 'test' } };
describe('AI authoritative ledger', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.create.mockResolvedValue({ id: 'call1' });
    db.findUnique.mockResolvedValue(null);
    db.count.mockResolvedValue(0);
    db.update.mockImplementation(async ({ data }) => ({ id: 'call1', ...data }));
    queryRaw.mockResolvedValue([{ id: input.userId }]);
    transaction.mockImplementation(async callback => callback(prisma));
  });
  afterEach(() => { delete process.env.AI_DAILY_CALL_LIMIT; });

  it('refuses a new provider call when the Shanghai-day quota is exhausted', async () => {
    process.env.AI_DAILY_CALL_LIMIT = '2';
    db.count.mockResolvedValue(2);
    const provider = jest.fn();
    await expect(runAiCall(input, provider)).rejects.toMatchObject({ status_code: 429 });
    expect(provider).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
  });

  it('serializes the last daily slot across simultaneous submissions before either provider runs', async () => {
    process.env.AI_DAILY_CALL_LIMIT = '2';
    let used = 1;
    let queued: Promise<unknown> = Promise.resolve();
    transaction.mockImplementation(callback => {
      const pending = queued.then(() => callback(prisma));
      queued = pending.catch(() => {});
      return pending;
    });
    db.count.mockImplementation(async () => used);
    db.create.mockImplementation(async () => { used += 1; return { id: 'last-slot' }; });
    const provider = jest.fn().mockResolvedValue({ data: [{ url: 'https://example.com/a.png' }] });
    const outcomes = await Promise.allSettled([
      runAiCall(input, provider), runAiCall({ ...input, requestKey: 'request-2' }, provider),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { status_code: 429 } });
    expect(provider).toHaveBeenCalledTimes(1);
    expect(db.create).toHaveBeenCalledTimes(1);
  });

  it('locks before checking quota and releases the transaction before making a provider request', async () => {
    const order: string[] = [];
    transaction.mockImplementation(async callback => {
      order.push('begin'); const result = await callback(prisma); order.push('commit'); return result;
    });
    queryRaw.mockImplementation(async () => { order.push('lock'); return [{ id: input.userId }]; });
    db.count.mockImplementation(async () => { order.push('count'); return 0; });
    await runAiCall(input, async () => { order.push('provider'); return { data: [{ url: 'https://example.com/a.png' }] }; });
    expect(order).toEqual(['begin', 'lock', 'count', 'commit', 'provider']);
    expect(queryRaw.mock.calls[0][0].sql).toContain('FOR UPDATE');
    expect(queryRaw.mock.calls[0][0].values).toEqual([input.userId]);
  });

  it('replays a successful request without consuming quota even when the daily limit is reached', async () => {
    db.count.mockResolvedValue(200);
    const result = { data: [{ url: 'https://example.com/a.png' }] };
    db.findUnique.mockResolvedValue({ id: 'call1', requestHash: aiRequestHash(input), status: 'success', result });
    const provider = jest.fn();
    expect((await runAiCall(input, provider)).result).toEqual(result);
    expect(db.count).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it('counts the Shanghai calendar day rather than the UTC date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-04T16:01:00Z'));
    try {
      await runAiCall(input, async () => ({ data: [{ url: 'https://example.com/a.png' }] }));
      expect(db.count).toHaveBeenCalledWith({ where: {
        userId: input.userId, provenance: 'native', startedAt: { gte: new Date('2026-10-04T16:00:00Z') },
      } });
    } finally { jest.useRealTimers(); }
  });
  it('refuses provider execution when initial persistence fails', async () => {
    db.create.mockRejectedValue(new Error('offline'));
    const provider = jest.fn();
    await expect(runAiCall(input, provider)).rejects.toThrow('offline');
    expect(provider).not.toHaveBeenCalled();
  });
  it('uses server prices, counts outputs, and persists before return', async () => {
    const result = await runAiCall(input, async () => ({ data: [{ url: 'https://example.com/a.png' }] }));
    expect(result.call.outputCount).toBe(1);
    expect(String(result.call.estimatedCost)).toBe('0.08');
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'success', currency: 'CNY' }) }));
  });
  it('does not call the provider on concurrent duplicate requests', async () => {
    db.create.mockRejectedValue({ code: 'P2002' });
    db.findUnique.mockResolvedValue({ id: 'call1', requestHash: 'different', status: 'pending' });
    const provider = jest.fn();
    await expect(runAiCall(input, provider)).rejects.toMatchObject({ status_code: 409 });
    expect(provider).not.toHaveBeenCalled();
  });
  it('records a timeout as unknown without retrying provider', async () => {
    const provider = jest.fn().mockRejectedValue(new Error('timeout'));
    await expect(runAiCall(input, provider)).rejects.toThrow('结果未知');
    expect(provider).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'unknown', estimatedCost: null }) }));
  });
  it('rejects empty provider output instead of claiming a successful image', async () => {
    await expect(runAiCall(input, async () => ({ data: [] }))).rejects.toThrow('有效');
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'unknown' }) }));
  });
  it.each(['pending', 'unknown', 'failed'])('never resubmits an identical %s call', async status => {
    db.create.mockRejectedValue({ code: 'P2002' });
    db.findUnique.mockResolvedValue({ id: 'call1', requestHash: aiRequestHash(input), status });
    const provider = jest.fn();
    await expect(runAiCall(input, provider)).rejects.toMatchObject({ status_code: 409 });
    expect(provider).not.toHaveBeenCalled();
  });
  it('replays a confirmed success even when image delivery previously failed', async () => {
    const result = { data: [{ url: 'https://example.com/image.png' }] };
    db.create.mockRejectedValue({ code: 'P2002' });
    db.findUnique.mockResolvedValue({ id: 'call1', requestHash: aiRequestHash(input), status: 'success', deliveryStatus: 'failed', result });
    const provider = jest.fn();
    expect((await runAiCall(input, provider)).result).toEqual(result);
    expect(provider).not.toHaveBeenCalled();
  });
  it('cannot repeat a provider success when terminal DB persistence fails', async () => {
    const provider = jest.fn().mockResolvedValue({ data: [{ url: 'https://example.com/image.png' }] });
    db.update.mockRejectedValue(new Error('terminal write failed'));
    await expect(runAiCall(input, provider)).rejects.toThrow('terminal write failed');
    db.create.mockRejectedValue({ code: 'P2002' });
    db.findUnique.mockResolvedValue({ requestHash: aiRequestHash(input), status: 'pending' });
    await expect(runAiCall(input, provider)).rejects.toMatchObject({ status_code: 409 });
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('allows distinct users to use the same request key', async () => {
    const provider = jest.fn().mockResolvedValue({ data: [{ url: 'https://example.com/image.png' }] });
    await runAiCall(input, provider);
    await runAiCall({ ...input, userId: 'u2' }, provider);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(db.create.mock.calls.map(([arg]) => arg.data.userId)).toEqual(['u1', 'u2']);
  });
  it('multiplies using Decimal and persists every confirmed output', async () => {
    const response = await runAiCall(input, async () => ({ data: Array.from({ length: 3 }, () => ({ url: 'https://example.com/image.png' })) }));
    expect(String(response.call.estimatedCost)).toBe('0.24');
    expect(response.call.outputCount).toBe(3);
  });
  it('distinguishes configuration failure before submission', async () => {
    await expect(runAiCall(input, async () => { throw new ApiError(503, 'Not configured', true); })).rejects.toMatchObject({ status_code: 422 });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed', errorCode: 'NOT_SUBMITTED' }) }));
  });
  it('persists analysis with no generated image count', async () => {
    const response = await runAiCall({ ...input, kind: 'analysis', model: 'doubao-seed-2-0-lite' }, async () => ({ choices: [{ message: { content: 'Analysis' } }] }));
    expect(response.call.outputCount).toBe(0);
    expect(String(response.call.estimatedCost)).toBe('0.01');
    expect(response.call.storageStatus).toBe('not_applicable');
  });
});
