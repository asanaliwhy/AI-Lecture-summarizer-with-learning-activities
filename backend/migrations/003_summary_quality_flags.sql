ALTER TABLE summaries
    ADD COLUMN IF NOT EXISTS is_quality_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS quality_fallback_reason TEXT;

