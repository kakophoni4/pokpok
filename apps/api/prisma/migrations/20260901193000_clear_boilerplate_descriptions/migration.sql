-- Thin fields that were a generic disclaimer, not a real tournament description.
UPDATE "Tournament"
SET description = NULL
WHERE description ILIKE '%Приходите за 30 минут%'
   OR description ILIKE '%Спортивный покер без денежных ставок. Регистрация до старта.%';
