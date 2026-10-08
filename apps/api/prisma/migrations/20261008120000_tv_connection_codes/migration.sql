ALTER TABLE "LiveTournament" ADD COLUMN "displayCode" TEXT;
CREATE UNIQUE INDEX "LiveTournament_displayCode_key" ON "LiveTournament"("displayCode");
DO $$
DECLARE item RECORD; next_code TEXT;
BEGIN
  FOR item IN SELECT "tournamentId" FROM "LiveTournament" WHERE "displayCode" IS NULL LOOP
    LOOP
      next_code := (100000 + floor(random() * 900000))::integer::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "LiveTournament" WHERE "displayCode" = next_code);
    END LOOP;
    UPDATE "LiveTournament" SET "displayCode" = next_code WHERE "tournamentId" = item."tournamentId";
  END LOOP;
END $$;
