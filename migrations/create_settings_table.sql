-- Settings table for application-wide configuration
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default hero shuffle setting
INSERT INTO settings (key, value) VALUES ('hero_shuffle_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
