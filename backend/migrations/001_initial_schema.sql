-- Lectura Initial Schema
-- All tables per architecture specification §11

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(72) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    plan VARCHAR(20) DEFAULT 'free',
    gemini_api_key_enc TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email);

-- Content
CREATE TABLE content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(10) NOT NULL, -- "youtube" | "file"
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    source_url TEXT,
    file_path TEXT,
    title VARCHAR(500) NOT NULL,
    duration_seconds INTEGER,
    transcript TEXT,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_content_user_id ON content(user_id);

-- Summaries
CREATE TABLE summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_id UUID REFERENCES content(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL DEFAULT '',
    format VARCHAR(20) NOT NULL DEFAULT 'cornell',
    length_setting VARCHAR(20) NOT NULL DEFAULT 'standard',
    config_json JSONB DEFAULT '{}',
    content_raw TEXT,
    cornell_cues TEXT,
    cornell_notes TEXT,
    cornell_summary TEXT,
    tags TEXT[] DEFAULT '{}',
    description TEXT,
    word_count INTEGER DEFAULT 0,
    is_favorite BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ
);

CREATE INDEX idx_summaries_user_id ON summaries(user_id);
CREATE INDEX idx_summaries_tags ON summaries USING GIN(tags);

-- Quizzes
CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary_id UUID REFERENCES summaries(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    config_json JSONB DEFAULT '{}',
    questions_json JSONB DEFAULT '[]',
    question_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quizzes_user_id ON quizzes(user_id);

-- Quiz Attempts
CREATE TABLE quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answers_json JSONB DEFAULT '[]',
    score_percent NUMERIC(5,2),
    correct_count INTEGER,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    time_taken_seconds INTEGER
);

CREATE INDEX idx_quiz_attempts_user_id ON quiz_attempts(user_id);
CREATE INDEX idx_quiz_attempts_quiz_id ON quiz_attempts(quiz_id);

-- Flashcard Decks
CREATE TABLE flashcard_decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary_id UUID REFERENCES summaries(id) ON DELETE SET NULL,
    title VARCHAR(500) NOT NULL,
    config_json JSONB DEFAULT '{}',
    card_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flashcard_decks_user_id ON flashcard_decks(user_id);

-- Flashcard Cards
CREATE TABLE flashcard_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id UUID NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    front TEXT NOT NULL,
    back TEXT NOT NULL,
    mnemonic TEXT,
    example TEXT,
    topic VARCHAR(200),
    difficulty SMALLINT DEFAULT 1,
    interval_days INTEGER DEFAULT 1,
    ease_factor NUMERIC(4,2) DEFAULT 2.50,
    repetitions INTEGER DEFAULT 0,
    next_review_at DATE DEFAULT CURRENT_DATE + INTERVAL '1 day',
    last_reviewed_at TIMESTAMPTZ
);

CREATE INDEX idx_flashcard_cards_deck_id ON flashcard_cards(deck_id);
CREATE INDEX idx_flashcard_cards_next_review ON flashcard_cards(next_review_at);

-- Jobs
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    reference_id UUID NOT NULL,
    config_json JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    retry_count SMALLINT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_status ON jobs(status);

-- User Settings
CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_summary_length VARCHAR(20) DEFAULT 'standard',
    default_format VARCHAR(20) DEFAULT 'cornell',
    default_difficulty VARCHAR(10) DEFAULT 'medium',
    language VARCHAR(10) DEFAULT 'en',
    notifications_json JSONB DEFAULT '{"processing_complete": true, "weekly_digest": false}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
