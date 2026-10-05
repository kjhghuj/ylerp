import './config/environment';
import type { Server } from 'node:http';
import { createApp } from './app';
import {
  prisma, initializeRuntimeResources, closeRuntimeResources,
} from './infrastructure/runtimeResources';
import { createGracefulShutdown, type StoppableJob } from './infrastructure/gracefulShutdown';
import { getCollector, stopCollector, stopCollectorClaims } from './collector/runtime';
import { startFinanceBackup } from './services/financeBackup';
import { ShopeeAuthorizationService, startShopeeTokenRefresh } from './services/shopeeAuthorization';
import { startProductAnalysisImportWorker } from './services/productAnalysisImportService';
import { startProductAnalysisBackfillWorker } from './services/productAnalysisBackfill';
import { startProductChatHistoryCleanup } from './services/productAnalysisChatHistory';

export { prisma, redis, safeRedis } from './infrastructure/runtimeResources';

export function startServer(): { server: Server; shutdown: () => Promise<void> } {
  const shopeeAuthorization = new ShopeeAuthorizationService(prisma);
  const app = createApp({ shopeeAuthorization });
  const port = process.env.PORT || 4002;
  const jobs: StoppableJob[] = [];
  let importWorker: StoppableJob | undefined;
  let server: Server;
  try {
    getCollector();
    initializeRuntimeResources();
    jobs.push(startFinanceBackup());
    jobs.push(startShopeeTokenRefresh(shopeeAuthorization));
    jobs.push(startProductAnalysisBackfillWorker());
    jobs.push(startProductChatHistoryCleanup());
    importWorker = startProductAnalysisImportWorker();
    server = app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    void createGracefulShutdown({
      closeHttp: async () => {}, stopCollector, stopCollectorClaims, jobs, importWorker,
      closeResources: closeRuntimeResources,
    })();
    throw error;
  }
  const shutdown = createGracefulShutdown({
    closeHttp: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    }),
    forceCloseHttp: () => server.closeAllConnections(),
    stopCollector,
    stopCollectorClaims,
    jobs,
    importWorker,
    closeResources: closeRuntimeResources,
  });
  const handleSignal = () => {
    void shutdown().finally(() => {
      removeListeners();
      process.exit(0);
    });
  };
  const handleServerError = (error: Error) => {
    console.error('HTTP server failed:', error);
    void shutdown().finally(() => {
      removeListeners();
      process.exitCode = 1;
    });
  };
  const removeListeners = () => {
    process.removeListener('SIGINT', handleSignal);
    process.removeListener('SIGTERM', handleSignal);
    server.removeListener('error', handleServerError);
  };
  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);
  server.once('error', handleServerError);
  return { server, shutdown: () => shutdown().finally(removeListeners) };
}

if (require.main === module) {
  try { startServer(); }
  catch (error) {
    console.error('Backend startup failed:', error);
    process.exitCode = 1;
  }
}
