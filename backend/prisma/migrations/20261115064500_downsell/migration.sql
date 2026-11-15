-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "downsellStepId" TEXT;

-- CreateTable
CREATE TABLE "DownsellStep" (
    "id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "priceCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownsellStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownsellSend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DownsellSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DownsellSend_stepId_idx" ON "DownsellSend"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "DownsellSend_userId_stepId_key" ON "DownsellSend"("userId", "stepId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_downsellStepId_fkey" FOREIGN KEY ("downsellStepId") REFERENCES "DownsellStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownsellSend" ADD CONSTRAINT "DownsellSend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownsellSend" ADD CONSTRAINT "DownsellSend_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "DownsellStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

