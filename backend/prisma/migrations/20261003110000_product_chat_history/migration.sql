CREATE TABLE "ProductAnalysisChatTurn" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "userContent" TEXT NOT NULL,
  "assistantContent" TEXT NOT NULL,
  "from" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductAnalysisChatTurn_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductAnalysisChatTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProductAnalysisChatTurn_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "ProductAnalysisShop"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductAnalysisChatTurn_userId_requestKey_key" ON "ProductAnalysisChatTurn"("userId", "requestKey");
CREATE INDEX "ProductAnalysisChatTurn_userId_shopId_itemId_createdAt_idx" ON "ProductAnalysisChatTurn"("userId", "shopId", "itemId", "createdAt");
CREATE INDEX "ProductAnalysisChatTurn_createdAt_idx" ON "ProductAnalysisChatTurn"("createdAt");
