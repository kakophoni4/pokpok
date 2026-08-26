-- AlterEnum
ALTER TYPE "PaymentKind" ADD VALUE 'rebuy';

-- AlterTable
ALTER TABLE "ClubSettings" ADD COLUMN     "rebuyPriceRub" INTEGER NOT NULL DEFAULT 500;
