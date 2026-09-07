CREATE TABLE "ShopeeAuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "appBinding" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT,
    "pendingCredentials" TEXT,
    "confirmationHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShopeeAuthSession_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ShopeeConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "shopName" TEXT,
    "region" TEXT,
    "encryptedCredentials" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "refreshLeaseUntil" TIMESTAMP(3),
    "nextRefreshAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShopeeConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopeeAuthSession_stateHash_key" ON "ShopeeAuthSession"("stateHash");
CREATE INDEX "ShopeeAuthSession_expiresAt_idx" ON "ShopeeAuthSession"("expiresAt");
CREATE INDEX "ShopeeAuthSession_userId_status_idx" ON "ShopeeAuthSession"("userId", "status");
CREATE UNIQUE INDEX "ShopeeConnection_environment_partnerId_shopId_key" ON "ShopeeConnection"("environment", "partnerId", "shopId");
CREATE INDEX "ShopeeConnection_userId_idx" ON "ShopeeConnection"("userId");
CREATE INDEX "ShopeeConnection_status_nextRefreshAt_idx" ON "ShopeeConnection"("status", "nextRefreshAt");
ALTER TABLE "ShopeeAuthSession" ADD CONSTRAINT "ShopeeAuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShopeeConnection" ADD CONSTRAINT "ShopeeConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
