import { startScheduledTask } from '../scheduledTask';

describe('scheduled tasks', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('preserves initial delay and recurring cadence and stops both timers', async () => {
    const run = jest.fn().mockResolvedValue(undefined);
    const task = startScheduledTask(run, { intervalMs: 1_000, initialDelayMs: 100 });
    await jest.advanceTimersByTimeAsync(99);
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(900);
    expect(run).toHaveBeenCalledTimes(2);
    task();
    task.stop();
    await jest.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not overlap slow work and drains the current run after stopping', async () => {
    let complete!: () => void;
    const run = jest.fn(() => new Promise<void>(resolve => { complete = resolve; }));
    const task = startScheduledTask(run, { intervalMs: 100, immediate: true });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);
    task.stop();
    const done = jest.fn();
    const draining = task.drain().then(done);
    await Promise.resolve();
    expect(done).not.toHaveBeenCalled();
    complete();
    await draining;
    expect(done).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('continues after synchronous errors and asynchronous rejections', async () => {
    const run = jest.fn()
      .mockImplementationOnce(() => { throw new Error('sync'); })
      .mockRejectedValueOnce(new Error('async'))
      .mockResolvedValue(undefined);
    const onError = jest.fn();
    const task = startScheduledTask(run, { intervalMs: 100, immediate: true, onError });
    await jest.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(2);
    task.stop();
    await task.drain();
  });

  it('can cancel a deferred first run', async () => {
    const run = jest.fn();
    const task = startScheduledTask(run, { intervalMs: 1_000, initialDelayMs: 100 });
    task.stop();
    await jest.advanceTimersByTimeAsync(2_000);
    expect(run).not.toHaveBeenCalled();
  });
});
