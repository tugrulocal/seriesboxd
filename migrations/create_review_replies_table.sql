CREATE TABLE IF NOT EXISTS review_replies (
    reply_id          SERIAL PRIMARY KEY,
    user_id           INTEGER NOT NULL,
    review_type       VARCHAR(20) NOT NULL CHECK (review_type IN ('series', 'episode')),
    parent_review_id  INTEGER NOT NULL,
    reply_text        TEXT NOT NULL,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_replies_parent ON review_replies (review_type, parent_review_id, created_at);