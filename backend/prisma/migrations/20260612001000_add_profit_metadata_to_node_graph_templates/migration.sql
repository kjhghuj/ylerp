CREATE TABLE IF NOT EXISTS "NodeGraphTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "country" TEXT,
    "platform" TEXT,
    "type" TEXT NOT NULL DEFAULT 'profit',

    CONSTRAINT "NodeGraphTemplate_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'NodeGraphTemplate' AND column_name = 'country'
    ) THEN
        ALTER TABLE "NodeGraphTemplate" ADD COLUMN "country" TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'NodeGraphTemplate' AND column_name = 'platform'
    ) THEN
        ALTER TABLE "NodeGraphTemplate" ADD COLUMN "platform" TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'NodeGraphTemplate' AND column_name = 'type'
    ) THEN
        ALTER TABLE "NodeGraphTemplate" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'profit';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NodeGraphTemplate_userId_fkey'
    ) THEN
        ALTER TABLE "NodeGraphTemplate"
        ADD CONSTRAINT "NodeGraphTemplate_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

UPDATE "NodeGraphTemplate"
SET "type" = 'profit'
WHERE "type" IS NULL;

CREATE INDEX IF NOT EXISTS "NodeGraphTemplate_type_country_platform_idx"
ON "NodeGraphTemplate"("type", "country", "platform");
