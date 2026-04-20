"""Run settings table migration"""
import psycopg2
from psycopg2.extras import RealDictCursor
import os

# Database connection
conn = psycopg2.connect(
    host=os.getenv("DB_HOST", "localhost"),
    database=os.getenv("DB_NAME", "seriesboxd"),
    user=os.getenv("DB_USER", "postgres"),
    password=os.getenv("DB_PASSWORD", "12345")
)

try:
    cur = conn.cursor()

    # Create settings table
    print("Creating settings table...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key VARCHAR(100) PRIMARY KEY,
            value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Insert default hero shuffle setting
    print("Inserting default hero shuffle setting...")
    cur.execute("""
        INSERT INTO settings (key, value) VALUES ('hero_shuffle_enabled', 'false')
        ON CONFLICT (key) DO NOTHING;
    """)

    conn.commit()
    print("Migration completed successfully!")

except Exception as e:
    print(f"Migration failed: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()
