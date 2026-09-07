jest.mock('../../index', () => ({
  prisma: { aiUsageCall: { count: jest.fn() } },
}));

import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import { prisma } from '../../index';
import { guardAiRequest, resetAiRequestGuardForTests } from '../aiRequestGuard';

const count = prisma.aiUsageCall.count as jest.Mock;

function response() {
  const emitter = new EventEmitter() as EventEmitter & Partial<Response>;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  emitter.status = status;
  return { res: emitter as Response, status, json };
}

describe('AI request guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAiRequestGuardForTests();
    count.mockResolvedValue(0);
    process.env.AI_MAX_CONCURRENT_CALLS = '1';
  });

  afterEach(() => delete process.env.AI_MAX_CONCURRENT_CALLS);

  it('does not count non-AI product-analysis mutations', async () => {
    const next = jest.fn();
    await guardAiRequest({ method: 'POST', baseUrl: '/api/product-analysis', path: '/shops', user: { id: 'u1' } } as Request, response().res, next);
    expect(next).toHaveBeenCalled();
    expect(count).not.toHaveBeenCalled();
  });

  it('blocks concurrent calls and releases the slot on response finish', async () => {
    const request = { method: 'POST', baseUrl: '/api/chroma-adapt', path: '/generate', user: { id: 'u1' } } as Request;
    const first = response();
    await guardAiRequest(request, first.res, jest.fn());
    const second = response();
    await guardAiRequest(request, second.res, jest.fn());
    expect(second.status).toHaveBeenCalledWith(429);
    first.res.emit('finish');
    const third = response();
    const next = jest.fn();
    await guardAiRequest(request, third.res, next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks the configured Shanghai-day call limit', async () => {
    process.env.AI_DAILY_CALL_LIMIT = '2';
    count.mockResolvedValue(2);
    const { res, status } = response();
    await guardAiRequest({ method: 'POST', baseUrl: '/api/product-analysis', path: '/chat', user: { id: 'u1' } } as Request, res, jest.fn());
    expect(status).toHaveBeenCalledWith(429);
    delete process.env.AI_DAILY_CALL_LIMIT;
  });
});
