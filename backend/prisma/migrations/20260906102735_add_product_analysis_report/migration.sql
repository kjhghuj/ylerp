-- DropIndex
DROP INDEX "NodeGraphTemplate_type_country_platform_idx";

-- AlterTable
ALTER TABLE "ProductProfitTemplate" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "ProductAnalysisReport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "platform" TEXT NOT NULL DEFAULT 'shopee',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ProductAnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductAnalysisReport_userId_createdAt_idx" ON "ProductAnalysisReport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductAnalysisReport" ADD CONSTRAINT "ProductAnalysisReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
