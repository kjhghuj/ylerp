CREATE TABLE "ProductAnalysisCredentialSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAnalysisCredentialSource_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductAnalysisCredentialSource_connectionId_key" ON "ProductAnalysisCredentialSource"("connectionId");
CREATE UNIQUE INDEX "ProductAnalysisCredentialSource_accountKey_key" ON "ProductAnalysisCredentialSource"("accountKey");
ALTER TABLE "ProductAnalysisCredentialSource" ADD CONSTRAINT "ProductAnalysisCredentialSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProductAnalysisCollectorBinding" (
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "shopeeShopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductAnalysisCollectorBinding_pkey" PRIMARY KEY ("shopId")
);
CREATE UNIQUE INDEX "ProductAnalysisCollectorBinding_sourceId_key" ON "ProductAnalysisCollectorBinding"("sourceId");
CREATE UNIQUE INDEX "ProductAnalysisCollectorBinding_site_shopeeShopId_key" ON "ProductAnalysisCollectorBinding"("site", "shopeeShopId");
CREATE INDEX "ProductAnalysisCollectorBinding_userId_idx" ON "ProductAnalysisCollectorBinding"("userId");
ALTER TABLE "ProductAnalysisCollectorBinding" ADD CONSTRAINT "ProductAnalysisCollectorBinding_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnalysisCollectorBinding" ADD CONSTRAINT "ProductAnalysisCollectorBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnalysisCollectorBinding" ADD CONSTRAINT "ProductAnalysisCollectorBinding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProductAnalysisCredentialSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ProductAnalysisCollectionRun" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "collectorBatchId" INTEGER,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "recollectExisting" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'STARTING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductAnalysisCollectionRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductAnalysisCollectionRun_shopId_requestId_key" ON "ProductAnalysisCollectionRun"("shopId", "requestId");
CREATE UNIQUE INDEX "ProductAnalysisCollectionRun_one_active_per_shop" ON "ProductAnalysisCollectionRun"("shopId") WHERE "status" IN ('STARTING','ACTIVE','PAUSED');
CREATE INDEX "ProductAnalysisCollectionRun_shopId_status_idx" ON "ProductAnalysisCollectionRun"("shopId", "status");
ALTER TABLE "ProductAnalysisCollectionRun" ADD CONSTRAINT "ProductAnalysisCollectionRun_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnalysisCollectionRun" ADD CONSTRAINT "ProductAnalysisCollectionRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProductAnalysisCollectorImport" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "checksum" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rowCount" INTEGER,
    "uploadId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductAnalysisCollectorImport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProductAnalysisCollectorImport_idempotencyKey_key" ON "ProductAnalysisCollectorImport"("idempotencyKey");
CREATE UNIQUE INDEX "ProductAnalysisCollectorImport_runId_reportDate_checksum_key" ON "ProductAnalysisCollectorImport"("runId", "reportDate", "checksum");
CREATE INDEX "ProductAnalysisCollectorImport_status_createdAt_idx" ON "ProductAnalysisCollectorImport"("status", "createdAt");
ALTER TABLE "ProductAnalysisCollectorImport" ADD CONSTRAINT "ProductAnalysisCollectorImport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ProductAnalysisCollectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnalysisCollectorImport" ADD CONSTRAINT "ProductAnalysisCollectorImport_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnalysisCollectorImport" ADD CONSTRAINT "ProductAnalysisCollectorImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
