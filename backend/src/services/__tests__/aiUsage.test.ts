jest.mock('../../index', () => ({ prisma: { aiUsageCall: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() } } }));
import { prisma } from '../../index';
import { runAiCall, aiRequestHash } from '../aiUsage';
import { ApiError } from '../chroma/config';

const db = prisma.aiUsageCall as unknown as Record<string, jest.Mock>;
const input = { userId: 'u1', requestKey: 'request-1', operationId: 'operation-1', mode: 'edit', kind: 'generation' as const, model: 'doubao-seedream-4.5', payload: { image: 'test' } };
describe('AI authoritative ledger', () => {
  beforeEach(() => { jest.resetAllMocks(); db.create.mockResolvedValue({ id: 'call1' }); db.update.mockImplementation(async ({ data }) => ({ id: 'call1', ...data })); });
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
