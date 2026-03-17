ALTER TABLE summaries
ADD COLUMN IF NOT EXISTS follow_up_questions JSONB DEFAULT '[]'::jsonb;
