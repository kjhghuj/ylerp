-- Product is the canonical source for tax rates. Columns begin nullable so
-- legacy ProductProfitTemplate snapshots can be backfilled deterministically.
ALTER TABLE "Product"
ADD COLUMN IF NOT EXISTS "vatRate" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "corporateIncomeTaxRate" DOUBLE PRECISION;

-- Match the API/import contract without letting an out-of-range float literal
-- abort the migration. Only ordinary decimal/scientific syntax is accepted.
CREATE OR REPLACE FUNCTION "__parse_product_tax_rate_20260716170000"(input TEXT)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    normalized TEXT;
    significand TEXT;
    parsed DOUBLE PRECISION;
BEGIN
    normalized := BTRIM(input, E' \t\n\r\f' || CHR(11));
    IF normalized IS NULL
       OR normalized = ''
       OR normalized !~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
    THEN
        RETURN NULL;
    END IF;

    significand := SPLIT_PART(LOWER(normalized), 'e', 1);
    IF significand !~ '[1-9]' THEN
        RETURN 0;
    END IF;

    BEGIN
        parsed := normalized::DOUBLE PRECISION;
    EXCEPTION
        WHEN INVALID_TEXT_REPRESENTATION OR NUMERIC_VALUE_OUT_OF_RANGE THEN
            RETURN NULL;
    END;

    -- Reject a non-zero decimal that underflowed to zero.
    IF parsed = 0 THEN
        RETURN NULL;
    END IF;
    RETURN parsed;
END;
$$;

CREATE OR REPLACE FUNCTION "__normalize_product_site_20260716170000"(input TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
    SELECT CASE UPPER(BTRIM(input, E' \t\n\r\f' || CHR(11)))
        WHEN 'SG' THEN 'SGD'
        WHEN 'MY' THEN 'MYR'
        WHEN 'PH' THEN 'PHP'
        WHEN 'TH' THEN 'THB'
        WHEN 'ID' THEN 'IDR'
        WHEN 'CN' THEN 'CNY'
        ELSE UPPER(BTRIM(input, E' \t\n\r\f' || CHR(11)))
    END
$$;

-- Templates are ranked by:
--   1. non-empty Product.country matching non-empty template.country
--   2. any Product.sites entry matching template.country
--   3. all other sites
-- then updatedAt DESC, createdAt DESC, id ASC for stable selection.
-- Each tax field is selected independently and only fills a NULL canonical field.
WITH "vatCandidates" AS (
    SELECT
        p."id" AS "productId",
        parsed."value",
        ROW_NUMBER() OVER (
            PARTITION BY p."id"
            ORDER BY
                CASE
                    WHEN NULLIF("__normalize_product_site_20260716170000"(p."country"), '') IS NOT NULL
                     AND NULLIF("__normalize_product_site_20260716170000"(ppt."country"), '') IS NOT NULL
                     AND "__normalize_product_site_20260716170000"(p."country")
                         = "__normalize_product_site_20260716170000"(ppt."country")
                    THEN 0
                    WHEN EXISTS (
                        SELECT 1
                        FROM UNNEST(p."sites") AS site("code")
                        WHERE NULLIF("__normalize_product_site_20260716170000"(site."code"), '') IS NOT NULL
                          AND "__normalize_product_site_20260716170000"(site."code")
                              = "__normalize_product_site_20260716170000"(ppt."country")
                    )
                    THEN 1
                    ELSE 2
                END,
                ppt."updatedAt" DESC,
                ppt."createdAt" DESC,
                ppt."id" ASC
        ) AS "rank"
    FROM "Product" p
    JOIN "ProductProfitTemplate" ppt ON ppt."productId" = p."id"
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN JSONB_TYPEOF(ppt."data" -> 'vatRate') IN ('number', 'string')
            THEN "__parse_product_tax_rate_20260716170000"(ppt."data" ->> 'vatRate')
        END AS "value"
    ) parsed
    WHERE parsed."value" IS NOT NULL
)
UPDATE "Product" p
SET "vatRate" = candidate."value"
FROM "vatCandidates" candidate
WHERE p."id" = candidate."productId"
  AND candidate."rank" = 1
  AND p."vatRate" IS NULL;

WITH "corporateTaxCandidates" AS (
    SELECT
        p."id" AS "productId",
        parsed."value",
        ROW_NUMBER() OVER (
            PARTITION BY p."id"
            ORDER BY
                CASE
                    WHEN NULLIF("__normalize_product_site_20260716170000"(p."country"), '') IS NOT NULL
                     AND NULLIF("__normalize_product_site_20260716170000"(ppt."country"), '') IS NOT NULL
                     AND "__normalize_product_site_20260716170000"(p."country")
                         = "__normalize_product_site_20260716170000"(ppt."country")
                    THEN 0
                    WHEN EXISTS (
                        SELECT 1
                        FROM UNNEST(p."sites") AS site("code")
                        WHERE NULLIF("__normalize_product_site_20260716170000"(site."code"), '') IS NOT NULL
                          AND "__normalize_product_site_20260716170000"(site."code")
                              = "__normalize_product_site_20260716170000"(ppt."country")
                    )
                    THEN 1
                    ELSE 2
                END,
                ppt."updatedAt" DESC,
                ppt."createdAt" DESC,
                ppt."id" ASC
        ) AS "rank"
    FROM "Product" p
    JOIN "ProductProfitTemplate" ppt ON ppt."productId" = p."id"
    CROSS JOIN LATERAL (
        SELECT CASE
            WHEN JSONB_TYPEOF(ppt."data" -> 'corporateIncomeTaxRate') IN ('number', 'string')
            THEN "__parse_product_tax_rate_20260716170000"(ppt."data" ->> 'corporateIncomeTaxRate')
        END AS "value"
    ) parsed
    WHERE parsed."value" IS NOT NULL
)
UPDATE "Product" p
SET "corporateIncomeTaxRate" = candidate."value"
FROM "corporateTaxCandidates" candidate
WHERE p."id" = candidate."productId"
  AND candidate."rank" = 1
  AND p."corporateIncomeTaxRate" IS NULL;

UPDATE "Product"
SET "vatRate" = 1
WHERE "vatRate" IS NULL;

UPDATE "Product"
SET "corporateIncomeTaxRate" = 5
WHERE "corporateIncomeTaxRate" IS NULL;

ALTER TABLE "Product"
ALTER COLUMN "vatRate" SET DEFAULT 1,
ALTER COLUMN "vatRate" SET NOT NULL,
ALTER COLUMN "corporateIncomeTaxRate" SET DEFAULT 5,
ALTER COLUMN "corporateIncomeTaxRate" SET NOT NULL;

DROP FUNCTION "__normalize_product_site_20260716170000"(TEXT);
DROP FUNCTION "__parse_product_tax_rate_20260716170000"(TEXT);
