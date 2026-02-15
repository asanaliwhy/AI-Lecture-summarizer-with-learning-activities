ALTER TABLE flashcard_decks
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_user_favorite
ON flashcard_decks(user_id, is_favorite);
