-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "country" TEXT,
    "totalRevenue" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "productWeight" DOUBLE PRECISION NOT NULL,
    "firstWeight" DOUBLE PRECISION NOT NULL,
    "baseShippingFee" DOUBLE PRECISION NOT NULL,
    "extraShippingFee" DOUBLE PRECISION NOT NULL,
    "crossBorderFee" DOUBLE PRECISION NOT NULL,
    "sellerCoupon" DOUBLE PRECISION NOT NULL,
    "platformCoupon" DOUBLE PRECISION NOT NULL,
    "platformCouponRate" DOUBLE PRECISION,
    "platformCommissionRate" DOUBLE PRECISION NOT NULL,
    "transactionFeeRate" DOUBLE PRECISION NOT NULL,
    "damageReturnRate" DOUBLE PRECISION NOT NULL,
    "adROI" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "corporateIncomeTaxRate" DOUBLE PRECISION NOT NULL,
    "supplierTaxPoint" DOUBLE PRECISION NOT NULL,
    "mdvServiceFeeRate" DOUBLE PRECISION NOT NULL,
    "fssServiceFeeRate" DOUBLE PRECISION NOT NULL,
    "ccbServiceFeeRate" DOUBLE PRECISION NOT NULL,
    "platformInfrastructureFee" DOUBLE PRECISION NOT NULL,
    "warehouseOperationFee" DOUBLE PRECISION NOT NULL,
    "supplierInvoice" TEXT NOT NULL,
    "quantityPerBox" DOUBLE PRECISION,
    "volume" TEXT,
    "shipping" DOUBLE PRECISION NOT NULL,
    "fees" DOUBLE PRECISION NOT NULL,
    "marketing" DOUBLE PRECISION NOT NULL,
    "taxes" DOUBLE PRECISION NOT NULL,
    "profit" DOUBLE PRECISION NOT NULL,
    "margin" DOUBLE PRECISION NOT NULL,
    "costMargin" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceRecord" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "FinanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "stockOfficial" INTEGER NOT NULL,
    "stockThirdParty" INTEGER NOT NULL,
    "inTransit" INTEGER NOT NULL,
    "dailySales" DOUBLE PRECISION NOT NULL,
    "leadTime" INTEGER NOT NULL,
    "replenishCycle" INTEGER NOT NULL,
    "costPerUnit" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarehouseMapping" (
    "id" TEXT NOT NULL,
    "officialWarehouseId" TEXT,
    "thirdPartyWarehouseId" TEXT,
    "sku" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "WarehouseMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuGroup" (
    "id" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "skus" TEXT[],

    CONSTRAINT "SkuGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfitTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfitTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "parentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
