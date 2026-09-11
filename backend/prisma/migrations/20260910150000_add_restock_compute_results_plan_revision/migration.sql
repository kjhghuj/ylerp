-- 补货V3 第二轮：服务端计算结果暂存 + 计划快照版本化（幂等/并发/完整溯源）。
-- 增量迁移：RestockPlanSnapshot 仅加列，历史数据保留（旧行 revision/version 默认 1，
-- resultId/idempotencyKey 为空 → 导出时按"历史版本信息不完整"标注）。

CREATE TABLE "RestockComputeResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "sourceSnapshotId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestockComputeResult_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RestockPlanSnapshot" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "resultId" TEXT,
ADD COLUMN "idempotencyKey" TEXT;

CREATE INDEX "RestockComputeResult_userId_expiresAt_idx" ON "RestockComputeResult"("userId", "expiresAt");
CREATE INDEX "RestockComputeResult_expiresAt_idx" ON "RestockComputeResult"("expiresAt");

CREATE UNIQUE INDEX "RestockPlanSnapshot_userId_idempotencyKey_key" ON "RestockPlanSnapshot"("userId", "idempotencyKey");

ALTER TABLE "RestockComputeResult" ADD CONSTRAINT "RestockComputeResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
