import { createGracefulShutdown } from '../gracefulShutdown';

describe('graceful shutdown', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('keeps imports available while collectors finish, then drains jobs before resources close', async () => {
    const order: string[] = [];
    let finishCollector!: () => void;
    const shutdown = createGracefulShutdown({
      closeHttp: async () => { order.push('http'); },
      stopCollectorClaims: () => { order.push('collector-claims-stop'); },
      stopCollector: () => { order.push('collector'); return new Promise<void>(resolve => { finishCollector = resolve; }); },
      jobs: [{ stop: () => order.push('job-stop'), drain: async () => { order.push('job-drain'); } }],
      importWorker: { stop: () => order.push('imports-stop'), drain: async () => { order.push('imports-drain'); } },
      closeResources: async () => { order.push('resources'); },
    });
    const pending = shutdown();
    await jest.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['job-stop', 'collector-claims-stop', 'http', 'job-drain', 'collector']);
    finishCollector();
    await pending;
    expect(order.indexOf('imports-stop')).toBeGreaterThan(order.indexOf('collector'));
    expect(order.indexOf('resources')).toBeGreaterThan(order.indexOf('imports-drain'));
  });

  it('keeps the collector database open until accepted requests and scheduled work both finish', async () => {
    let finishRequest!: () => void;
    let finishJob!: () => void;
    const stopCollector = jest.fn().mockResolvedValue(undefined);
    const shutdown = createGracefulShutdown({
      closeHttp: () => new Promise<void>(resolve => { finishRequest = resolve; }),
      jobs: [{ stop: jest.fn(), drain: () => new Promise<void>(resolve => { finishJob = resolve; }) }],
      stopCollector,
      closeResources: async () => {},
    });
    const pending = shutdown();
    await jest.advanceTimersByTimeAsync(0);
    expect(stopCollector).not.toHaveBeenCalled();
    finishRequest();
    await jest.advanceTimersByTimeAsync(0);
    expect(stopCollector).not.toHaveBeenCalled();
    finishJob();
    await pending;
    expect(stopCollector).toHaveBeenCalledTimes(1);
  });

  it('bounds work that never finishes and closes resources exactly once for repeated calls', async () => {
    const closeResources = jest.fn().mockResolvedValue(undefined);
    const forceCloseHttp = jest.fn();
    const stopImports = jest.fn();
    const stopCollector = jest.fn().mockResolvedValue(undefined);
    const stopCollectorClaims = jest.fn();
    const onError = jest.fn();
    const shutdown = createGracefulShutdown({
      closeHttp: () => new Promise<void>(() => {}),
      forceCloseHttp,
      stopCollector,
      stopCollectorClaims,
      importWorker: { stop: stopImports, drain: async () => {} },
      closeResources,
      timeoutMs: 100,
      onError,
    });
    const first = shutdown();
    const second = shutdown();
    expect(first).toBe(second);
    await jest.advanceTimersByTimeAsync(100);
    await first;
    expect(stopImports).toHaveBeenCalledTimes(1);
    expect(forceCloseHttp).toHaveBeenCalledTimes(1);
    expect(stopCollectorClaims).toHaveBeenCalledTimes(1);
    // Closing sockets does not cancel asynchronous request handlers using SQLite.
    expect(stopCollector).not.toHaveBeenCalled();
    expect(closeResources).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalled();
  });

  it('still closes resources when one shutdown step fails', async () => {
    const closeResources = jest.fn().mockResolvedValue(undefined);
    const onError = jest.fn();
    const shutdown = createGracefulShutdown({
      closeHttp: async () => { throw new Error('http'); },
      stopCollector: async () => { throw new Error('collector'); },
      jobs: [{ stop: () => { throw new Error('stop'); }, drain: async () => { throw new Error('drain'); } }],
      closeResources,
      onError,
    });
    await shutdown();
    expect(closeResources).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalled();
  });
});
