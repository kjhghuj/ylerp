-- 补货V3 升级（2026-09）：店铺专属映射/规则、库存池、计划快照。
-- 增量迁移：不改动 V2 的 ExternalSkuMapping / RestockSkuRule，V2 历史映射与规则全部保留并继续生效。

-- CreateTable：店铺专属 SKU 映射（优先级高于站点级 ExternalSkuMapping）
CREATE TABLE "RestockShopSkuMapping" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "externalSku" TEXT NOT NULL,
    "targetSku" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockShopSkuMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable：店铺专属 SKU 参数规则（字段级覆盖：店铺 > 站点 > 全局）
CREATE TABLE "RestockShopRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "leadTimeDays" INTEGER,
    "safetyDays" INTEGER,
    "growthPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockShopRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable：库存池（命名的仓库范围）
CREATE TABLE "RestockStockPool" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "warehouseCodes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockStockPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable：补货计划快照（草稿/已确认/已作废；确认后修改以新版本保留历史）
CREATE TABLE "RestockPlanSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "site" TEXT NOT NULL,
    "shopIds" TEXT[],
    "poolId" TEXT,
    "warehouseCodes" TEXT[],
    "rangeFrom" TEXT NOT NULL,
    "rangeTo" TEXT NOT NULL,
    "salesMetric" TEXT NOT NULL DEFAULT 'unitsOrdered',
    "parameters" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "snapshotMeta" JSONB NOT NULL,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "RestockPlanSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestockShopSkuMapping_userId_shopId_externalSku_key" ON "RestockShopSkuMapping"("userId", "shopId", "externalSku");
CREATE INDEX "RestockShopSkuMapping_userId_shopId_idx" ON "RestockShopSkuMapping"("userId", "shopId");
CREATE INDEX "RestockShopSkuMapping_userId_site_idx" ON "RestockShopSkuMapping"("userId", "site");

CREATE UNIQUE INDEX "RestockShopRule_userId_shopId_sku_key" ON "RestockShopRule"("userId", "shopId", "sku");
CREATE INDEX "RestockShopRule_userId_shopId_idx" ON "RestockShopRule"("userId", "shopId");

CREATE UNIQUE INDEX "RestockStockPool_userId_name_key" ON "RestockStockPool"("userId", "name");
CREATE INDEX "RestockStockPool_userId_site_idx" ON "RestockStockPool"("userId", "site");

CREATE INDEX "RestockPlanSnapshot_userId_status_createdAt_idx" ON "RestockPlanSnapshot"("userId", "status", "createdAt");
CREATE INDEX "RestockPlanSnapshot_userId_site_idx" ON "RestockPlanSnapshot"("userId", "site");

-- AddForeignKey
ALTER TABLE "RestockShopSkuMapping" ADD CONSTRAINT "RestockShopSkuMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockShopSkuMapping" ADD CONSTRAINT "RestockShopSkuMapping_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockShopRule" ADD CONSTRAINT "RestockShopRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockShopRule" ADD CONSTRAINT "RestockShopRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockStockPool" ADD CONSTRAINT "RestockStockPool_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RestockPlanSnapshot" ADD CONSTRAINT "RestockPlanSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
