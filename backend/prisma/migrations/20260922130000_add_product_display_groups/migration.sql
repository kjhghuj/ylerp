CREATE TABLE "ProductDisplayGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductDisplayGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductDisplayGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDisplayGroupMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductDisplayGroupMember_productId_key"
ON "ProductDisplayGroupMember"("productId");

CREATE UNIQUE INDEX "ProductDisplayGroupMember_groupId_productId_key"
ON "ProductDisplayGroupMember"("groupId", "productId");

CREATE INDEX "ProductDisplayGroup_userId_updatedAt_idx"
ON "ProductDisplayGroup"("userId", "updatedAt");

CREATE INDEX "ProductDisplayGroupMember_groupId_createdAt_idx"
ON "ProductDisplayGroupMember"("groupId", "createdAt");

ALTER TABLE "ProductDisplayGroup"
ADD CONSTRAINT "ProductDisplayGroup_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductDisplayGroupMember"
ADD CONSTRAINT "ProductDisplayGroupMember_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "ProductDisplayGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductDisplayGroupMember"
ADD CONSTRAINT "ProductDisplayGroupMember_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
