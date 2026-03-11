BEGIN;

-- This migration is idempotent and safe to re-run.
-- Re-running after successful completion will update zero rows
-- and the Phase 3 verification will pass immediately.
--
-- OPERATIONAL NOTES:
-- 1. Run the pre-migration collision report query before deploying.
-- 2. If collisions exist, review deactivated accounts after deployment at:
--    SELECT * FROM users WHERE email LIKE 'deactivated_duplicate_%@lectura.invalid';
-- 3. Deactivated accounts retain all their data and can be manually
--    reactivated with a corrected email address if needed.
-- 4. In a zero-collision dataset (expected for most deployments)
--    Phase 1 updates zero rows and Phase 2 normalizes mixed-case emails.
--
-- PRE-MIGRATION COLLISION REPORT QUERY:
-- SELECT
--     LOWER(email) AS normalized_email,
--     COUNT(*) AS account_count,
--     ARRAY_AGG(email ORDER BY created_at ASC) AS emails,
--     ARRAY_AGG(id ORDER BY created_at ASC) AS ids,
--     ARRAY_AGG(created_at ORDER BY created_at ASC) AS created_dates,
--     ARRAY_AGG(is_active ORDER BY created_at ASC) AS active_states
-- FROM users
-- GROUP BY LOWER(email)
-- HAVING COUNT(*) > 1
-- ORDER BY account_count DESC;

-- Phase 1: Detect and resolve case-insensitive collisions before normalization.
-- Keep oldest account per lowercase-email group and deactivate newer duplicates.
-- No data is deleted.
UPDATE users u
SET
    is_active = FALSE,
    email = 'deactivated_duplicate_' || u.id::text || '@lectura.invalid'
WHERE u.id IN (
    SELECT id
    FROM (
        SELECT
            id,
            ROW_NUMBER() OVER (
                PARTITION BY LOWER(email)
                ORDER BY created_at ASC, id ASC
            ) AS rn
        FROM users
    ) ranked
    WHERE ranked.rn > 1
);

-- Phase 2: Normalize remaining email values.
UPDATE users
SET email = LOWER(email)
WHERE email <> LOWER(email);

-- Phase 3: Verify no case-insensitive duplicates remain.
DO $$
DECLARE
    collision_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO collision_count
    FROM (
        SELECT LOWER(email)
        FROM users
        GROUP BY LOWER(email)
        HAVING COUNT(*) > 1
    ) collisions;

    IF collision_count > 0 THEN
        RAISE EXCEPTION
            'Email normalization aborted: % collision group(s) remain after deduplication. Manual review required.',
            collision_count;
    END IF;
END $$;

COMMIT;
