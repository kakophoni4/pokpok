ALTER TABLE "Achievement" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'club';
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_category_check" CHECK ("category" IN ('game', 'club'));
UPDATE "Achievement" SET "category" = 'game' WHERE "code" IN ('hand_of_the_day', 'quads', 'straight_flush', 'royal_flush');
