CREATE TABLE "FloorCredential" (
  "userId" TEXT NOT NULL PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE,
  "passwordHash" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
