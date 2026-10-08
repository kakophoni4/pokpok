CREATE TABLE "DealerCredential" ("userId" TEXT PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE, "passwordHash" TEXT NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "DealerTablet" ("id" TEXT PRIMARY KEY, "tournamentId" TEXT NOT NULL REFERENCES "Tournament"("id") ON DELETE CASCADE, "tableNumber" INTEGER NOT NULL, "tokenHash" TEXT NOT NULL UNIQUE, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "DealerTablet_tournamentId_tableNumber_idx" ON "DealerTablet"("tournamentId", "tableNumber");
CREATE TABLE "DealerShift" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT, "tabletId" TEXT NOT NULL REFERENCES "DealerTablet"("id") ON DELETE RESTRICT, "tournamentId" TEXT NOT NULL REFERENCES "Tournament"("id") ON DELETE RESTRICT, "tableNumber" INTEGER NOT NULL, "endElapsed" INTEGER, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3), "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "roundingMinutes" INTEGER NOT NULL DEFAULT 30, "roundingMode" TEXT NOT NULL DEFAULT 'nearest');
CREATE INDEX "DealerShift_userId_startedAt_idx" ON "DealerShift"("userId", "startedAt");
CREATE INDEX "DealerShift_tabletId_endedAt_idx" ON "DealerShift"("tabletId", "endedAt");
ALTER TABLE "ClubSettings" ADD COLUMN "dealerPayroll" JSONB;
