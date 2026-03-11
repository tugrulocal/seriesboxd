"""
Yerel PostgreSQL'deki kullanıcıları canlı DigitalOcean DB'ye migrate eder.
Çalıştırmadan önce .env dosyasının REMOTE_DATABASE_URL içerdiğinden emin ol.

Kullanım:
    python migrate_users.py
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()

# --- Yerel DB bağlantısı ---
def get_local_conn():
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME", "seriesboxd"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "1234"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
    )

# --- Canlı DB bağlantısı ---
def get_remote_conn():
    db_url = os.getenv("DATABASE_URL") or os.getenv("REMOTE_DATABASE_URL")
    if not db_url:
        raise RuntimeError("REMOTE_DATABASE_URL veya DATABASE_URL .env dosyasında tanımlı değil!")
    if "sslmode" not in db_url:
        db_url += ("&" if "?" in db_url else "?") + "sslmode=require"
    return psycopg2.connect(db_url)


def migrate_users():
    print("Yerel DB'ye bağlanılıyor...")
    local_conn = get_local_conn()
    local_cur = local_conn.cursor(cursor_factory=RealDictCursor)

    print("Canlı DB'ye bağlanılıyor...")
    remote_conn = get_remote_conn()
    remote_cur = remote_conn.cursor(cursor_factory=RealDictCursor)

    # Yerel kullanıcıları çek
    local_cur.execute(
        "SELECT username, email, password_hash, avatar, bio, is_verified, created_at FROM users ORDER BY user_id"
    )
    users = local_cur.fetchall()
    print(f"\nYerel DB'de {len(users)} kullanıcı bulundu.\n")

    inserted = 0
    skipped = 0

    for u in users:
        try:
            remote_cur.execute(
                """
                INSERT INTO users (username, email, password_hash, avatar, bio, is_verified, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (username) DO NOTHING
                """,
                (
                    u["username"],
                    u["email"],
                    u["password_hash"],
                    u.get("avatar"),
                    u.get("bio"),
                    u.get("is_verified", False),
                    u.get("created_at"),
                ),
            )
            if remote_cur.rowcount == 1:
                print(f"  [✓] Eklendi   : {u['username']} ({u['email']})")
                inserted += 1
            else:
                print(f"  [–] Atlandı   : {u['username']} (zaten var)")
                skipped += 1
        except psycopg2.errors.UniqueViolation:
            remote_conn.rollback()
            print(f"  [!] Çakışma    : {u['username']} / {u['email']} zaten canlıda mevcut")
            skipped += 1
        except Exception as e:
            remote_conn.rollback()
            print(f"  [X] HATA       : {u['username']} — {e}")
            skipped += 1

    remote_conn.commit()

    print(f"\n--- Sonuç ---")
    print(f"Eklenen  : {inserted}")
    print(f"Atlanan  : {skipped}")
    print(f"Toplam   : {len(users)}")

    local_cur.close()
    local_conn.close()
    remote_cur.close()
    remote_conn.close()


if __name__ == "__main__":
    migrate_users()
