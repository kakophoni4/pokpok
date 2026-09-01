-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "minRating" INTEGER;

-- CreateTable
CREATE TABLE "ClubMenuItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "priceRub" INTEGER NOT NULL DEFAULT 0,
    "chips" INTEGER NOT NULL DEFAULT 0,
    "isFixed" BOOLEAN NOT NULL DEFAULT false,
    "isPromo" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClubMenuItem_sortOrder_idx" ON "ClubMenuItem"("sortOrder");
