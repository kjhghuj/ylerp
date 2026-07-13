ALTER TABLE "RestockSalesItem" ADD COLUMN "dismissedAt" TIMESTAMP(3);

CREATE INDEX "RestockSalesItem_importId_dismissedAt_idx"
  ON "RestockSalesItem"("importId", "dismissedAt");
