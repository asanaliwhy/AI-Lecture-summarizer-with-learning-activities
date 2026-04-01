CREATE TABLE presentations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL DEFAULT '',
    topic TEXT,
    language VARCHAR(10) NOT NULL DEFAULT 'en',
    theme VARCHAR(20) NOT NULL DEFAULT 'navy',
    slide_count INTEGER NOT NULL DEFAULT 0,
    slides JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    quality_fallback BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ
);

CREATE INDEX idx_presentations_user_id ON presentations(user_id);
CREATE INDEX idx_presentations_created_at ON presentations(created_at DESC);
