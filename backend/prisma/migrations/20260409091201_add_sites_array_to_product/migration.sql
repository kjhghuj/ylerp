-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "sites" TEXT[] DEFAULT ARRAY[]::TEXT[];
