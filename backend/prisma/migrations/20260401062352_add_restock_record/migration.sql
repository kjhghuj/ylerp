-- CreateTable
CREATE TABLE "RestockRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "items" JSONB NOT NULL,

    CONSTRAINT "RestockRecord_pkey" PRIMARY KEY ("id")
);
