/*
  Warnings:

  - Added the required column `sellerCouponPlatformRatio` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sellerCouponPlatformRatio" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "sellerCouponType" TEXT NOT NULL DEFAULT 'fixed';

-- AlterTable
ALTER TABLE "ProfitTemplate" ADD COLUMN     "platform" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'profit';
