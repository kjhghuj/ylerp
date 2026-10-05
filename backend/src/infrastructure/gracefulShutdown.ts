export interface StoppableJob {
  stop(): void;
  drain?(): Promise<void>;
}

interface ShutdownOptions {
  closeHttp: () => Promise<void>;
  forceCloseHttp?: () => void;
  stopCollectorClaims?: () => void;
  stopCollector: () => Promise<void>;
  jobs?: StoppableJob[];
  importWorker?: StoppableJob;
  closeResources: () => Promise<void>;
  timeoutMs?: number;
  resourceTimeoutMs?: number;
  onError?: (error: unknown) => void;
}

/** Collectors may still need the import worker to confirm files while they drain. */
export function createGracefulShutdown(options: ShutdownOptions): () => Promise<void> {
  const report = (error: unknown) => {
    if (options.onError) options.onError(error);
    else console.error('Shutdown step failed:', error);
  };
  const perform = async (action: () => unknown | Promise<unknown>) => {
    try { await action(); } catch (error) { report(error); }
  };
  const waitWithin = async (work: Promise<unknown>, timeoutMs: number): Promise<boolean> => {
    if (timeoutMs <= 0) return false;
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work.then(() => true),
        new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  };
  let shutdown: Promise<void> | undefined;
  return () => {
    if (shutdown) return shutdown;
    shutdown = (async () => {
      const deadline = Date.now() + (options.timeoutMs ?? 20_000);
      for (const job of options.jobs ?? []) {
        try { job.stop(); } catch (error) { report(error); }
      }
      await perform(() => options.stopCollectorClaims?.());
      // Accepted HTTP requests and backfill jobs can still access collector SQLite.
      const producersDrained = await waitWithin(Promise.all([
        perform(options.closeHttp),
        ...(options.jobs ?? []).map(job => perform(() => job.drain?.())),
      ]), deadline - Date.now());
      if (!producersDrained) {
        report(new Error('Shutdown work exceeded its time limit'));
        await perform(() => options.forceCloseHttp?.());
        // Forced socket closure cannot cancel handlers. Leave SQLite open for
        // those handlers until process termination instead of invalidating it.
      } else {
        const collectorDrained = await waitWithin(perform(options.stopCollector), deadline - Date.now());
        if (!collectorDrained) report(new Error('Collector shutdown exceeded its time limit'));
      }
      if (options.importWorker) {
        try { options.importWorker.stop(); } catch (error) { report(error); }
        const importsDrained = await waitWithin(
          perform(() => options.importWorker!.drain?.()), deadline - Date.now(),
        );
        if (!importsDrained) report(new Error('Import worker shutdown exceeded its time limit'));
      }
      const closed = await waitWithin(perform(options.closeResources), options.resourceTimeoutMs ?? 5_000);
      if (!closed) report(new Error('Resource shutdown exceeded its time limit'));
    })();
    return shutdown;
  };
}
