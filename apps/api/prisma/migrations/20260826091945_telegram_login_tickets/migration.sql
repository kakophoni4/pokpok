-- CreateEnum
CREATE TYPE "LoginTicketState" AS ENUM ('pending', 'confirmed', 'declined');

-- CreateTable
CREATE TABLE "LoginTicket" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "state" "LoginTicketState" NOT NULL DEFAULT 'pending',
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "LoginTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginTicket_code_key" ON "LoginTicket"("code");

-- CreateIndex
CREATE INDEX "LoginTicket_userId_idx" ON "LoginTicket"("userId");

-- CreateIndex
CREATE INDEX "LoginTicket_expiresAt_idx" ON "LoginTicket"("expiresAt");

-- AddForeignKey
ALTER TABLE "LoginTicket" ADD CONSTRAINT "LoginTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
