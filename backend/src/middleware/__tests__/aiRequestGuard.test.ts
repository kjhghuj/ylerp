import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import { guardAiRequest, resetAiRequestGuardForTests } from '../aiRequestGuard';

function response() {
  const emitter = new EventEmitter() as EventEmitter & Partial<Response>;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  emitter.status = status;
  return { res: emitter as Response, status, json };
}
const request = (id = 'u1') => ({
  method: 'POST', baseUrl: '/api/chroma-adapt', path: '/generate', user: { id },
} as Request);

describe('AI request guard', () => {
  beforeEach(() => {
    resetAiRequestGuardForTests();
    process.env.AI_MAX_CONCURRENT_CALLS = '1';
  });
  afterEach(() => {
    delete process.env.AI_MAX_CONCURRENT_CALLS;
    delete process.env.AI_CALLS_PER_MINUTE;
    jest.useRealTimers();
  });

  it('does not apply AI limits to ordinary product-analysis mutations', async () => {
    const next = jest.fn();
    await guardAiRequest({ ...request(), baseUrl: '/api/product-analysis', path: '/shops' } as Request, response().res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks concurrent calls and releases the slot on response finish', async () => {
    const first = response();
    await guardAiRequest(request(), first.res, jest.fn());
    const second = response();
    await guardAiRequest(request(), second.res, jest.fn());
    expect(second.status).toHaveBeenCalledWith(429);
    first.res.emit('finish');
    const next = jest.fn();
    await guardAiRequest(request(), response().res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('reserves the concurrency slot synchronously for simultaneous submissions', async () => {
    const firstNext = jest.fn();
    const secondNext = jest.fn();
    const second = response();
    await Promise.all([
      guardAiRequest(request(), response().res, firstNext),
      guardAiRequest(request(), second.res, secondNext),
    ]);
    expect(firstNext).toHaveBeenCalledTimes(1);
    expect(secondNext).not.toHaveBeenCalled();
    expect(second.status).toHaveBeenCalledWith(429);
  });

  it('keeps users independent and also guards product-analysis chat', async () => {
    await guardAiRequest(request('one'), response().res, jest.fn());
    const next = jest.fn();
    await guardAiRequest({ ...request('two'), baseUrl: '/api/product-analysis', path: '/chat' } as Request, response().res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('expires the minute allowance after a minute while retaining active slots', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T00:00:00Z'));
    process.env.AI_CALLS_PER_MINUTE = '1';
    const first = response();
    await guardAiRequest(request(), first.res, jest.fn());
    first.res.emit('finish');
    const blocked = response();
    await guardAiRequest(request(), blocked.res, jest.fn());
    expect(blocked.status).toHaveBeenCalledWith(429);
    jest.advanceTimersByTime(60_000);
    const next = jest.fn();
    await guardAiRequest(request(), response().res, next);
    expect(next).toHaveBeenCalledWith();
    jest.advanceTimersByTime(60_000);
    const active = response();
    await guardAiRequest(request(), active.res, jest.fn());
    expect(active.status).toHaveBeenCalledWith(429);
  });

  it('does not release another request when finish and close both fire', async () => {
    process.env.AI_MAX_CONCURRENT_CALLS = '2';
    const first = response();
    await guardAiRequest(request(), first.res, jest.fn());
    await guardAiRequest(request(), response().res, jest.fn());
    first.res.emit('finish'); first.res.emit('close');
    await guardAiRequest(request(), response().res, jest.fn());
    const fourth = response();
    await guardAiRequest(request(), fourth.res, jest.fn());
    expect(fourth.status).toHaveBeenCalledWith(429);
  });

  it('releases a disconnected response and tolerates malformed limits using defaults', async () => {
    const first = response();
    await guardAiRequest(request(), first.res, jest.fn());
    first.res.emit('close');
    process.env.AI_MAX_CONCURRENT_CALLS = '-3';
    process.env.AI_CALLS_PER_MINUTE = 'NaN';
    const next = jest.fn();
    await guardAiRequest(request(), response().res, next);
    expect(next).toHaveBeenCalledWith();
  });
});
