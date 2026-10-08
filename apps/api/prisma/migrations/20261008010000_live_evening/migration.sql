-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'dealer';

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "maxTables" INTEGER,
ADD COLUMN     "seatsPerTable" INTEGER NOT NULL DEFAULT 9;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "deferred" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LiveTournament" (
    "tournamentId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "displayToken" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveTournament_pkey" PRIMARY KEY ("tournamentId")
);

-- CreateTable
CREATE TABLE "CashReceipt" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountRub" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LiveTournament_displayToken_key" ON "LiveTournament"("displayToken");

-- CreateIndex
CREATE UNIQUE INDEX "CashReceipt_requestId_key" ON "CashReceipt"("requestId");

-- CreateIndex
CREATE INDEX "CashReceipt_userId_tournamentId_idx" ON "CashReceipt"("userId", "tournamentId");

-- AddForeignKey
ALTER TABLE "LiveTournament" ADD CONSTRAINT "LiveTournament_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashReceipt" ADD CONSTRAINT "CashReceipt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
