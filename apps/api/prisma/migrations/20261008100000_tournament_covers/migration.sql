ALTER TABLE "Tournament" ADD COLUMN "coverId" INTEGER;
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_coverId_range" CHECK ("coverId" BETWEEN 1 AND 20);
WITH covers AS (
  SELECT "id", ((ROW_NUMBER() OVER (ORDER BY "createdAt", "id") - 1) % 20 + 1)::INTEGER AS cover
  FROM "Tournament"
)
UPDATE "Tournament" SET "coverId" = covers.cover FROM covers WHERE "Tournament"."id" = covers."id";
