-- AlterTable
ALTER TABLE "User" ADD COLUMN "hrEngineerId" INTEGER,
ADD COLUMN "hrSyncedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_hrEngineerId_key" ON "User"("hrEngineerId");
