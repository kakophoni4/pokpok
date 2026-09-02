-- CreateTable
CREATE TABLE "PlayerPrize" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "comment" TEXT,
    "grantedById" TEXT,
    "wonAtId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "redeemedById" TEXT,
    "spentAtId" TEXT,
    "paymentId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,

    CONSTRAINT "PlayerPrize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPrize_paymentId_key" ON "PlayerPrize"("paymentId");

-- CreateIndex
CREATE INDEX "PlayerPrize_userId_redeemedAt_voidedAt_idx" ON "PlayerPrize"("userId", "redeemedAt", "voidedAt");

-- CreateIndex
CREATE INDEX "PlayerPrize_wonAtId_idx" ON "PlayerPrize"("wonAtId");

-- CreateIndex
CREATE INDEX "PlayerPrize_spentAtId_idx" ON "PlayerPrize"("spentAtId");

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "ClubMenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_wonAtId_fkey" FOREIGN KEY ("wonAtId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_spentAtId_fkey" FOREIGN KEY ("spentAtId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPrize" ADD CONSTRAINT "PlayerPrize_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

