-- CreateTable
CREATE TABLE "ChromaGenerationRecord" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "prompt" TEXT,
    "parameters" JSONB,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "imageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ChromaGenerationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChromaImage" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT,
    "size" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ChromaImage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ChromaGenerationRecord" ADD CONSTRAINT "ChromaGenerationRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChromaImage" ADD CONSTRAINT "ChromaImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
