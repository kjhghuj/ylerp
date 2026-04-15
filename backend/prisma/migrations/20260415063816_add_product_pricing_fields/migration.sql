/*
  Warnings:

  - You are about to drop the column `baseShippingFee` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `ccbServiceFeeRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `corporateIncomeTaxRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `costMargin` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `crossBorderFee` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `damageReturnRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `extraShippingFee` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `fees` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `firstWeight` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `fssServiceFeeRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `lastMileFee` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `margin` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `marketing` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `mdvServiceFeeRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `platformCommissionRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `platformCoupon` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `platformCouponRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `platformInfrastructureFee` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `profit` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `quantityPerBox` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `shipping` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `taxes` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `totalRevenue` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `transactionFeeRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `vatRate` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `volume` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `warehouseOperationFee` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Product" DROP COLUMN "baseShippingFee",
DROP COLUMN "ccbServiceFeeRate",
DROP COLUMN "corporateIncomeTaxRate",
DROP COLUMN "costMargin",
DROP COLUMN "crossBorderFee",
DROP COLUMN "damageReturnRate",
DROP COLUMN "extraShippingFee",
DROP COLUMN "fees",
DROP COLUMN "firstWeight",
DROP COLUMN "fssServiceFeeRate",
DROP COLUMN "lastMileFee",
DROP COLUMN "margin",
DROP COLUMN "marketing",
DROP COLUMN "mdvServiceFeeRate",
DROP COLUMN "platformCommissionRate",
DROP COLUMN "platformCoupon",
DROP COLUMN "platformCouponRate",
DROP COLUMN "platformInfrastructureFee",
DROP COLUMN "profit",
DROP COLUMN "quantityPerBox",
DROP COLUMN "shipping",
DROP COLUMN "taxes",
DROP COLUMN "totalRevenue",
DROP COLUMN "transactionFeeRate",
DROP COLUMN "vatRate",
DROP COLUMN "volume",
DROP COLUMN "warehouseOperationFee",
ALTER COLUMN "sellerCoupon" SET DEFAULT 0,
ALTER COLUMN "adROI" SET DEFAULT 15,
ALTER COLUMN "sellerCouponPlatformRatio" SET DEFAULT 0;
