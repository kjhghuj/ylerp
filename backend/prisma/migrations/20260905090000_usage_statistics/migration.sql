-- Additive ledgers. No legacy row is overwritten or deleted; actor IDs intentionally have no FK.
CREATE TABLE "UsageEvent" (
  "id" TEXT NOT NULL, "actorId" TEXT NOT NULL, "actorName" TEXT,
  "module" TEXT NOT NULL, "action" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'success',
  "source" TEXT NOT NULL DEFAULT 'user', "objectType" TEXT, "objectId" TEXT,
  "affectedCount" INTEGER NOT NULL DEFAULT 1, "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "eventKey" TEXT NOT NULL, "metadata" JSONB, "provenance" TEXT NOT NULL DEFAULT 'native',
  "legacySource" TEXT, "legacyId" TEXT, "migrationBatch" TEXT, "ruleVersion" TEXT,
  CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UsageEvent_affectedCount_check" CHECK ("affectedCount" >= 0),
  CONSTRAINT "UsageEvent_status_check" CHECK ("status" IN ('pending','success','failed','unknown')),
  CONSTRAINT "UsageEvent_source_check" CHECK ("source" IN ('user','system')),
  CONSTRAINT "UsageEvent_provenance_check" CHECK ("provenance" IN ('native','rebuilt','legacy'))
);
CREATE UNIQUE INDEX "UsageEvent_eventKey_key" ON "UsageEvent"("eventKey");
CREATE UNIQUE INDEX "UsageEvent_legacySource_legacyId_key" ON "UsageEvent"("legacySource", "legacyId");
CREATE INDEX "UsageEvent_actorId_occurredAt_idx" ON "UsageEvent"("actorId", "occurredAt");
CREATE INDEX "UsageEvent_module_status_occurredAt_idx" ON "UsageEvent"("module", "status", "occurredAt");
CREATE INDEX "UsageEvent_provenance_occurredAt_idx" ON "UsageEvent"("provenance", "occurredAt");

CREATE TABLE "AiUsageCall" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "actorName" TEXT, "requestKey" TEXT NOT NULL,
  "operationId" TEXT NOT NULL, "requestHash" TEXT NOT NULL, "kind" TEXT NOT NULL,
  "module" TEXT NOT NULL DEFAULT 'chroma', "mode" TEXT NOT NULL, "model" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "outputCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedCost" DECIMAL(18,6), "currency" TEXT NOT NULL DEFAULT 'CNY', "pricingVersion" TEXT,
  "providerRequestId" TEXT, "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
  "storageStatus" TEXT NOT NULL DEFAULT 'pending', "imageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "result" JSONB, "errorCode" TEXT, "errorMessage" TEXT, "provenance" TEXT NOT NULL DEFAULT 'native',
  "legacySource" TEXT, "legacyId" TEXT, "migrationBatch" TEXT, "ruleVersion" TEXT,
  CONSTRAINT "AiUsageCall_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiUsageCall_outputCount_check" CHECK ("outputCount" >= 0),
  CONSTRAINT "AiUsageCall_estimatedCost_check" CHECK ("estimatedCost" IS NULL OR ("estimatedCost" >= 0 AND "estimatedCost" != 'NaN'::numeric)),
  CONSTRAINT "AiUsageCall_currency_check" CHECK ("currency" = 'CNY'),
  CONSTRAINT "AiUsageCall_kind_check" CHECK ("kind" IN ('analysis','generation')),
  CONSTRAINT "AiUsageCall_status_check" CHECK ("status" IN ('pending','success','failed','unknown')),
  CONSTRAINT "AiUsageCall_provenance_check" CHECK ("provenance" IN ('native','rebuilt','legacy'))
);
CREATE UNIQUE INDEX "AiUsageCall_userId_requestKey_key" ON "AiUsageCall"("userId", "requestKey");
CREATE UNIQUE INDEX "AiUsageCall_legacySource_legacyId_key" ON "AiUsageCall"("legacySource", "legacyId");
CREATE INDEX "AiUsageCall_userId_startedAt_idx" ON "AiUsageCall"("userId", "startedAt");
CREATE INDEX "AiUsageCall_module_status_startedAt_idx" ON "AiUsageCall"("module", "status", "startedAt");
CREATE INDEX "AiUsageCall_provenance_startedAt_idx" ON "AiUsageCall"("provenance", "startedAt");
CREATE INDEX "AiUsageCall_operationId_idx" ON "AiUsageCall"("operationId");
