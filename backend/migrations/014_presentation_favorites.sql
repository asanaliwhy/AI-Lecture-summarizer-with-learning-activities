ALTER TABLE presentations
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_presentations_user_favorite
ON presentations(user_id, is_favorite);
