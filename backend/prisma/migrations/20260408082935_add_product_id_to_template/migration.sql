-- AlterTable
ALTER TABLE "ProfitTemplate" ADD COLUMN     "productId" TEXT;

-- AddForeignKey
ALTER TABLE "ProfitTemplate" ADD CONSTRAINT "ProfitTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
