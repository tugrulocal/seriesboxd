"""
migrate_series.py
-----------------
Yerel PostgreSQL'deki `series` tablosunu DigitalOcean Managed PostgreSQL'e taşır.

Kullanım:
  Ortam değişkenlerini ayarla (ya da .env dosyasına ekle):
    LOCAL_DATABASE_URL  = postgresql://user:pass@localhost:5432/seriesboxd
    REMOTE_DATABASE_URL = postgresql://user:pass@<do-host>:25060/defaultdb?sslmode=require

  Sonra çalıştır:
    python migrate_series.py
"""

import os
import sys
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

load_dotenv()

# ---------------------------------------------------------------------------
# Bağlantı URL'lerini al
# ---------------------------------------------------------------------------
LOCAL_URL  = os.getenv("LOCAL_DATABASE_URL",  "postgresql://postgres:1234@localhost:5432/seriesboxd")
REMOTE_URL = os.getenv("REMOTE_DATABASE_URL", "")

if not REMOTE_URL:
    print("HATA: REMOTE_DATABASE_URL ortam değişkeni tanımlı değil.")
    print("  Örnek:  REMOTE_DATABASE_URL=postgresql://doadmin:pass@db-host:25060/defaultdb?sslmode=require")
    sys.exit(1)

# DigitalOcean için sslmode=require zorunludur; URL'de yoksa ekle
parsed = urlparse(REMOTE_URL)
qs = parse_qs(parsed.query)
if "sslmode" not in qs:
    qs["sslmode"] = ["require"]
    new_query = urlencode({k: v[0] for k, v in qs.items()})
    REMOTE_URL = urlunparse(parsed._replace(query=new_query))

# ---------------------------------------------------------------------------
# CREATE TABLE DDL  (IF NOT EXISTS → idempotent)
# ---------------------------------------------------------------------------
CREATE_SERIES_TABLE = """
CREATE TABLE IF NOT EXISTS series (
    series_id          INTEGER PRIMARY KEY,
    name               VARCHAR,
    rating             DOUBLE PRECISION,
    overview           TEXT,
    poster_path        TEXT,
    status             VARCHAR,
    networks           TEXT,
    created_by         TEXT,
    genres             TEXT,
    backdrop_path      VARCHAR,
    vote_count         INTEGER,
    imdb_id            VARCHAR,
    origin_country     TEXT,
    original_language  VARCHAR,
    first_air_date     VARCHAR
);
"""

# Kaynak tablodan çekilecek sütunlar (DDL ile aynı sırada)
COLUMNS = [
    "series_id", "name", "rating", "overview", "poster_path",
    "status", "networks", "created_by", "genres", "backdrop_path",
    "vote_count", "imdb_id", "origin_country", "original_language",
    "first_air_date",
]

COL_LIST      = ", ".join(COLUMNS)
PLACEHOLDER   = ", ".join(["%s"] * len(COLUMNS))

INSERT_SQL = f"""
INSERT INTO series ({COL_LIST})
VALUES %s
ON CONFLICT (series_id) DO UPDATE SET
    name               = EXCLUDED.name,
    rating             = EXCLUDED.rating,
    overview           = EXCLUDED.overview,
    poster_path        = EXCLUDED.poster_path,
    status             = EXCLUDED.status,
    networks           = EXCLUDED.networks,
    created_by         = EXCLUDED.created_by,
    genres             = EXCLUDED.genres,
    backdrop_path      = EXCLUDED.backdrop_path,
    vote_count         = EXCLUDED.vote_count,
    imdb_id            = EXCLUDED.imdb_id,
    origin_country     = EXCLUDED.origin_country,
    original_language  = EXCLUDED.original_language,
    first_air_date     = EXCLUDED.first_air_date;
"""

BATCH_SIZE = 500  # tek seferde gönderilecek satır sayısı

# ---------------------------------------------------------------------------
# Ana işlem
# ---------------------------------------------------------------------------
def main():
    print("=== Seriesboxd → DigitalOcean Migrasyon Başlıyor ===\n")

    # Yerel bağlantı
    print(f"[1/4] Yerel veritabanına bağlanılıyor...")
    local_conn = psycopg2.connect(LOCAL_URL)
    local_cur  = local_conn.cursor()

    # Uzak bağlantı
    print(f"[2/4] DigitalOcean veritabanına bağlanılıyor (sslmode=require)...")
    remote_conn = psycopg2.connect(REMOTE_URL)
    remote_cur  = remote_conn.cursor()

    # Tablo oluştur
    print(f"[3/4] Uzak DB'de 'series' tablosu kontrol ediliyor / oluşturuluyor...")
    remote_cur.execute(CREATE_SERIES_TABLE)
    remote_conn.commit()

    # Verileri çek ve aktar
    print(f"[4/4] Veriler aktarılıyor (batch boyutu: {BATCH_SIZE})...")
    local_cur.execute(f"SELECT {COL_LIST} FROM series ORDER BY series_id;")

    total_inserted = 0
    batch_num = 0

    while True:
        rows = local_cur.fetchmany(BATCH_SIZE)
        if not rows:
            break
        batch_num += 1
        psycopg2.extras.execute_values(remote_cur, INSERT_SQL, rows)
        remote_conn.commit()
        total_inserted += len(rows)
        print(f"  Batch {batch_num}: {len(rows)} satır aktarıldı  (toplam: {total_inserted})")

    # Doğrulama: uzak DB'de kaç satır var?
    remote_cur.execute("SELECT COUNT(*) FROM series;")
    remote_count = remote_cur.fetchone()[0]

    # Kapat
    local_cur.close();  local_conn.close()
    remote_cur.close(); remote_conn.close()

    print()
    print("=" * 50)
    print(f"  Migrasyon tamamlandı!")
    print(f"  Aktarılan satır : {total_inserted}")
    print(f"  Uzak DB toplam  : {remote_count} satır")
    print("=" * 50)


if __name__ == "__main__":
    main()
