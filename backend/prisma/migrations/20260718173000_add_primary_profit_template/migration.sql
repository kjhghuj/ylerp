ALTER TABLE "ProductProfitTemplate"
ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;

UPDATE "ProductProfitTemplate"
SET "country" = CASE UPPER(TRIM("country"))
  WHEN 'SG' THEN 'SGD'
  WHEN 'MY' THEN 'MYR'
  WHEN 'PH' THEN 'PHP'
  WHEN 'TH' THEN 'THB'
  WHEN 'ID' THEN 'IDR'
  WHEN 'CN' THEN 'CNY'
  ELSE UPPER(TRIM("country"))
END;

CREATE INDEX "ProductProfitTemplate_productId_country_idx"
ON "ProductProfitTemplate"("productId", "country");

CREATE UNIQUE INDEX "ProductProfitTemplate_one_primary_per_site"
ON "ProductProfitTemplate"("productId", "country")
WHERE "isPrimary" = true;

ALTER TABLE "ProductProfitTemplate"
ADD CONSTRAINT "ProductProfitTemplate_supported_country"
CHECK ("country" IN ('SGD', 'MYR', 'PHP', 'THB', 'IDR', 'CNY'))
NOT VALID;
