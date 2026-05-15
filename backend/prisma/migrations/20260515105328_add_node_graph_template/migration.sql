-- CreateTable
CREATE TABLE "NodeGraphTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "productId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "NodeGraphTemplate_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "NodeGraphTemplate" ADD CONSTRAINT "NodeGraphTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
