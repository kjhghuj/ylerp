CREATE TABLE "ProductAnalysisCollectionSync" (
  "userId" TEXT PRIMARY KEY,
  "lastPluginSyncedAt" TIMESTAMP(3) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "ProductAnalysisCollectionSync_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ProductAnalysisCollectionBackfill" (
  "shopId" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "fromDate" DATE NOT NULL,
  "toDate" DATE NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "runId" TEXT,
  "completedDays" INTEGER NOT NULL DEFAULT 0,
  "detail" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductAnalysisCollectionBackfill_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductAnalysisCollectionBackfill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "ProductAnalysisCollectionSync"("userId") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductAnalysisCollectionBackfill_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductAnalysisCollectionRun"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "ProductAnalysisCollectionBackfill_userId_idx" ON "ProductAnalysisCollectionBackfill"("userId");
CREATE INDEX "ProductAnalysisCollectionBackfill_status_updatedAt_idx" ON "ProductAnalysisCollectionBackfill"("status", "updatedAt");
