export interface ScheduledTaskHandle {
  /** Existing callers may keep using the handle as their stop callback. */
  (): void;
  stop(): void;
  drain(): Promise<void>;
  readonly timer: NodeJS.Timeout;
}

interface ScheduledTaskOptions {
  intervalMs: number;
  immediate?: boolean;
  initialDelayMs?: number;
  onError?: (error: unknown) => void;
}

/** Recurring work is serialized; stopping cancels future runs without abandoning the current one. */
export function startScheduledTask(
  run: () => unknown | Promise<unknown>,
  options: ScheduledTaskOptions,
): ScheduledTaskHandle {
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error('Scheduled task interval must be positive');
  }
  if (options.initialDelayMs !== undefined && (
    !Number.isFinite(options.initialDelayMs) || options.initialDelayMs < 0
  )) {
    throw new Error('Scheduled task initial delay must be nonnegative');
  }
  let stopped = false;
  let running: Promise<void> | undefined;
  let initialTimer: NodeJS.Timeout | undefined;
  const launch = () => {
    if (stopped || running) return;
    running = Promise.resolve().then(() => { if (!stopped) return run(); }).then(() => undefined)
      .catch(error => {
        try {
          if (options.onError) options.onError(error);
          else console.error('Scheduled task failed:', error);
        } catch (handlerError) { console.error('Scheduled task error handler failed:', handlerError); }
      })
      .finally(() => { running = undefined; });
  };
  const timer = setInterval(launch, options.intervalMs);
  timer.unref();
  if (options.initialDelayMs !== undefined) {
    initialTimer = setTimeout(launch, options.initialDelayMs);
    initialTimer.unref();
  } else if (options.immediate) launch();

  const stop = () => {
    stopped = true;
    clearInterval(timer);
    if (initialTimer) clearTimeout(initialTimer);
  };
  return Object.assign(stop, {
    stop,
    drain: async () => { await running; },
    timer,
  });
}
