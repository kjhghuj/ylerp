/*
  Warnings:
  - Added the required column `userId` to multiple tables.
  - Existing data will be assigned to the first owner user.
*/

-- Helper: add nullable column first, fill with owner, then set NOT NULL

-- Step 1: Add nullable columns
ALTER TABLE "Product" ADD COLUMN "userId" TEXT;
ALTER TABLE "FinanceRecord" ADD COLUMN "userId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "userId" TEXT;
ALTER TABLE "WarehouseMapping" ADD COLUMN "userId" TEXT;
ALTER TABLE "SkuGroup" ADD COLUMN "userId" TEXT;
ALTER TABLE "RestockRecord" ADD COLUMN "userId" TEXT;
ALTER TABLE "ProfitTemplate" ADD COLUMN "userId" TEXT;

-- Step 2: Assign existing data to the first owner user
UPDATE "Product" SET "userId" = (SELECT id FROM "User" WHERE role = 'owner' ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "FinanceRecord" SET "userId" = (SELECT id FROM "User" WHERE role = 'owner' ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "InventoryItem" SET "userId" = (SELECT id FROM "User" WHERE role = 'owner' ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "WarehouseMapping" SET "userId" = (SELECT id FROM "User" WHERE role = 'owner' ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "SkuGroup" SET "userId" = (SELECT id FROM "User" WHERE role = 'owner' ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "RestockRecord" SET "userId" = (SELECT id FROM "User" WHERE role = 'owner' ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;
UPDATE "ProfitTemplate" SET "userId" = (SELECT id FROM "User" WHERE role = 'owner' ORDER BY "createdAt" ASC LIMIT 1) WHERE "userId" IS NULL;

-- Step 3: Set columns to NOT NULL
ALTER TABLE "Product" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "FinanceRecord" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "InventoryItem" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "WarehouseMapping" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "SkuGroup" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "RestockRecord" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ProfitTemplate" ALTER COLUMN "userId" SET NOT NULL;

-- Step 4: Add foreign keys
ALTER TABLE "Product" ADD CONSTRAINT "Product_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceRecord" ADD CONSTRAINT "FinanceRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WarehouseMapping" ADD CONSTRAINT "WarehouseMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SkuGroup" ADD CONSTRAINT "SkuGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RestockRecord" ADD CONSTRAINT "RestockRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfitTemplate" ADD CONSTRAINT "ProfitTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
