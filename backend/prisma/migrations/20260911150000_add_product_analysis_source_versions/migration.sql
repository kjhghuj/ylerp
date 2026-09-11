-- 商品分析完整工作表快照 + 同日不可变版本。
-- 现有记录无法还原原始工作表，统一标记 sourceComplete=false/version=1。

ALTER TABLE "ProductAnalysisDailyUpload"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "sourceSchemaVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourceHash" TEXT,
  ADD COLUMN "sourceSheetCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourceRowCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sourceComplete" BOOLEAN NOT NULL DEFAULT false;

DROP INDEX "ProductAnalysisDailyUpload_shopId_date_key";

CREATE UNIQUE INDEX "ProductAnalysisDailyUpload_shopId_date_version_key"
  ON "ProductAnalysisDailyUpload"("shopId", "date", "version");
CREATE INDEX "ProductAnalysisDailyUpload_shopId_date_isActive_idx"
  ON "ProductAnalysisDailyUpload"("shopId", "date", "isActive");
CREATE UNIQUE INDEX "ProductAnalysisDailyUpload_one_active_per_day_key"
  ON "ProductAnalysisDailyUpload"("shopId", "date") WHERE "isActive" = true;

CREATE TABLE "ProductAnalysisSourceSheet" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "sheetIndex" INTEGER NOT NULL,
  "sheetName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "range" TEXT,
  "headerRowNumber" INTEGER,
  "rowCount" INTEGER NOT NULL,
  "columnCount" INTEGER NOT NULL,
  "rows" JSONB NOT NULL,
  CONSTRAINT "ProductAnalysisSourceSheet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductAnalysisSourceSheet_uploadId_sheetIndex_key"
  ON "ProductAnalysisSourceSheet"("uploadId", "sheetIndex");
CREATE INDEX "ProductAnalysisSourceSheet_uploadId_category_idx"
  ON "ProductAnalysisSourceSheet"("uploadId", "category");
ALTER TABLE "ProductAnalysisSourceSheet"
  ADD CONSTRAINT "ProductAnalysisSourceSheet_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "ProductAnalysisDailyUpload"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
