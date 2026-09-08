-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiChatBaseUrl" TEXT,
ADD COLUMN     "aiChatApiKeyEnc" TEXT,
ADD COLUMN     "aiChatModel" TEXT,
ADD COLUMN     "aiImageApiKeyEnc" TEXT,
ADD COLUMN     "aiImageBaseUrl" TEXT,
ADD COLUMN     "aiImageEndpoints" JSONB;
