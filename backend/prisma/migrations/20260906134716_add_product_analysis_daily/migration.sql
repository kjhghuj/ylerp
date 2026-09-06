-- CreateTable
CREATE TABLE "ProductAnalysisShop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'shopee',
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ProductAnalysisShop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAnalysisDailyUpload" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fileName" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "warnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ProductAnalysisDailyUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDailyItem" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "sheetKey" TEXT NOT NULL,
    "status" TEXT,
    "salesOrdered" DOUBLE PRECISION,
    "salesConfirmed" DOUBLE PRECISION,
    "ordersOrdered" DOUBLE PRECISION,
    "ordersConfirmed" DOUBLE PRECISION,
    "unitsOrdered" DOUBLE PRECISION,
    "unitsConfirmed" DOUBLE PRECISION,
    "buyersOrdered" DOUBLE PRECISION,
    "buyersConfirmed" DOUBLE PRECISION,
    "impressions" DOUBLE PRECISION,
    "clicks" DOUBLE PRECISION,
    "uniqueImpressions" DOUBLE PRECISION,
    "uniqueClicks" DOUBLE PRECISION,
    "visitors" DOUBLE PRECISION,
    "pageViews" DOUBLE PRECISION,
    "bounceVisitors" DOUBLE PRECISION,
    "searchClicks" DOUBLE PRECISION,
    "likes" DOUBLE PRECISION,
    "cartVisitors" DOUBLE PRECISION,
    "cartUnits" DOUBLE PRECISION,
    "extra" JSONB,
    "variations" JSONB,

    CONSTRAINT "ProductDailyItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAnalysisShop_userId_idx" ON "ProductAnalysisShop"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAnalysisShop_userId_name_key" ON "ProductAnalysisShop"("userId", "name");

-- CreateIndex
CREATE INDEX "ProductAnalysisDailyUpload_shopId_date_idx" ON "ProductAnalysisDailyUpload"("shopId", "date");

-- CreateIndex
CREATE INDEX "ProductAnalysisDailyUpload_userId_idx" ON "ProductAnalysisDailyUpload"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAnalysisDailyUpload_shopId_date_key" ON "ProductAnalysisDailyUpload"("shopId", "date");

-- CreateIndex
CREATE INDEX "ProductDailyItem_uploadId_sheetKey_idx" ON "ProductDailyItem"("uploadId", "sheetKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDailyItem_uploadId_itemId_key" ON "ProductDailyItem"("uploadId", "itemId");

-- AddForeignKey
ALTER TABLE "ProductAnalysisShop" ADD CONSTRAINT "ProductAnalysisShop_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalysisDailyUpload" ADD CONSTRAINT "ProductAnalysisDailyUpload_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAnalysisDailyUpload" ADD CONSTRAINT "ProductAnalysisDailyUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyItem" ADD CONSTRAINT "ProductDailyItem_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "ProductAnalysisDailyUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
