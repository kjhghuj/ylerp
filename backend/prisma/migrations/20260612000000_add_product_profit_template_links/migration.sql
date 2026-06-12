-- Product-template links store the templates a product actually uses.
-- ProfitTemplate remains the reusable/shared template definition.
CREATE TABLE "ProductProfitTemplate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "platform" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductProfitTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductProfitTemplate_productId_idx" ON "ProductProfitTemplate"("productId");
CREATE INDEX "ProductProfitTemplate_templateId_idx" ON "ProductProfitTemplate"("templateId");

ALTER TABLE "ProductProfitTemplate"
ADD CONSTRAINT "ProductProfitTemplate_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductProfitTemplate"
ADD CONSTRAINT "ProductProfitTemplate_templateId_fkey"
FOREIGN KEY ("templateId") REFERENCES "ProfitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill old product-bound templates into product link snapshots.
INSERT INTO "ProductProfitTemplate" (
    "id",
    "productId",
    "templateId",
    "name",
    "country",
    "platform",
    "data",
    "createdAt",
    "updatedAt"
)
SELECT
    "productId" || '-' || "id",
    "productId",
    "id",
    "name",
    "country",
    "platform",
    "data",
    "createdAt",
    CURRENT_TIMESTAMP
FROM "ProfitTemplate"
WHERE "productId" IS NOT NULL;

-- Existing product-bound templates become reusable shared templates after their
-- product-specific snapshots have been backfilled above.
UPDATE "ProfitTemplate"
SET "productId" = NULL
WHERE "productId" IS NOT NULL;
