-- Refuse to add legacy uniqueness constraints when existing data would be lost.
-- This migration deliberately does not auto-delete or merge business records.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Product" GROUP BY "userId", "sku" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add Product user/SKU uniqueness: duplicate records exist';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "InventoryItem" GROUP BY "userId", "sku" HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add InventoryItem user/SKU uniqueness: duplicate records exist';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "WarehouseMapping"
    WHERE "thirdPartyWarehouseId" IS NOT NULL
    GROUP BY "userId", "type", "sku", "thirdPartyWarehouseId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add WarehouseMapping uniqueness: duplicate records exist';
  END IF;
END $$;

CREATE TABLE "RestockSalesImport" (
  "id" TEXT NOT NULL,
  "site" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "statisticsDays" INTEGER NOT NULL DEFAULT 30,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "RestockSalesImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestockSalesItem" (
  "id" TEXT NOT NULL,
  "platformSku" TEXT,
  "sourceSku" TEXT,
  "validSales" DOUBLE PRECISION NOT NULL,
  "title" TEXT,
  "spec" TEXT,
  "shop" TEXT,
  "targetSku" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "importId" TEXT NOT NULL,
  CONSTRAINT "RestockSalesItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalSkuMapping" (
  "id" TEXT NOT NULL,
  "site" TEXT NOT NULL,
  "externalSku" TEXT NOT NULL,
  "targetSku" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "ExternalSkuMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RestockSkuRule" (
  "id" TEXT NOT NULL,
  "site" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "leadTimeDays" INTEGER,
  "safetyDays" INTEGER,
  "growthPercent" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "RestockSkuRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RestockSalesImport_userId_site_createdAt_idx"
  ON "RestockSalesImport"("userId", "site", "createdAt");
CREATE INDEX "RestockSalesItem_importId_idx" ON "RestockSalesItem"("importId");
CREATE INDEX "RestockSalesItem_importId_targetSku_idx" ON "RestockSalesItem"("importId", "targetSku");
CREATE INDEX "ExternalSkuMapping_userId_site_targetSku_idx"
  ON "ExternalSkuMapping"("userId", "site", "targetSku");
CREATE UNIQUE INDEX "ExternalSkuMapping_userId_site_externalSku_key"
  ON "ExternalSkuMapping"("userId", "site", "externalSku");
CREATE INDEX "RestockSkuRule_userId_site_idx" ON "RestockSkuRule"("userId", "site");
CREATE UNIQUE INDEX "RestockSkuRule_userId_site_sku_key"
  ON "RestockSkuRule"("userId", "site", "sku");
CREATE UNIQUE INDEX "InventoryItem_userId_sku_key" ON "InventoryItem"("userId", "sku");
CREATE UNIQUE INDEX "Product_userId_sku_key" ON "Product"("userId", "sku");
CREATE UNIQUE INDEX "WarehouseMapping_userId_type_sku_thirdPartyWarehouseId_key"
  ON "WarehouseMapping"("userId", "type", "sku", "thirdPartyWarehouseId");

ALTER TABLE "RestockSalesImport"
  ADD CONSTRAINT "RestockSalesImport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockSalesItem"
  ADD CONSTRAINT "RestockSalesItem_importId_fkey"
  FOREIGN KEY ("importId") REFERENCES "RestockSalesImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalSkuMapping"
  ADD CONSTRAINT "ExternalSkuMapping_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockSkuRule"
  ADD CONSTRAINT "RestockSkuRule_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
