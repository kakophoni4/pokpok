ALTER TABLE "User" ADD COLUMN "creditLimitRub" INTEGER;
ALTER TABLE "ClubSettings" ADD COLUMN "defaultCreditLimitRub" INTEGER NOT NULL DEFAULT 3000;
ALTER TABLE "User" ADD CONSTRAINT "User_creditLimitRub_check" CHECK ("creditLimitRub" BETWEEN 0 AND 1000000);
ALTER TABLE "ClubSettings" ADD CONSTRAINT "ClubSettings_defaultCreditLimitRub_check" CHECK ("defaultCreditLimitRub" BETWEEN 0 AND 1000000);
