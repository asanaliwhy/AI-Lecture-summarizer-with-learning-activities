ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_quizzes_user_favorite
ON quizzes(user_id, is_favorite);
