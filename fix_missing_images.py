"""
fix_missing_images.py
─────────────────────────────────────────────────────────────────────
DB'de poster_path veya backdrop_path NULL olan dizileri tespit edip
TMDB'den (önce tr-TR, null dönerse en-US) görselleri yeniden çeker.
"""

import os
import sys
import time

import psycopg2
import requests
from dotenv import load_dotenv

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
DB_NAME      = os.getenv("DB_NAME")
DB_USER      = os.getenv("DB_USER")
DB_PASSWORD  = os.getenv("DB_PASSWORD")
DB_HOST      = os.getenv("DB_HOST")
DB_PORT      = os.getenv("DB_PORT", "5432")

BASE_URL = "https://api.themoviedb.org/3"


def get_db_conn():
    return psycopg2.connect(
        dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
        host=DB_HOST, port=DB_PORT,
    )


def fetch_images(series_id: int) -> tuple[str | None, str | None]:
    """poster_path ve backdrop_path'i döndürür. tr-TR null dönerse en-US dener."""
    for lang in ("tr-TR", "en-US", None):
        try:
            url = f"{BASE_URL}/tv/{series_id}?api_key={TMDB_API_KEY}"
            if lang:
                url += f"&language={lang}"
            d = requests.get(url, timeout=10).json()
            poster   = d.get("poster_path")
            backdrop = d.get("backdrop_path")
            # İkisi de null değilse bu dil yeterli
            if poster and backdrop:
                return poster, backdrop
            # Birisi null, ama hiç denemeye devam et
            if lang is None:
                return poster, backdrop
        except Exception:
            pass
        time.sleep(0.1)
    return None, None


def main():
    if not TMDB_API_KEY:
        print("[HATA] .env dosyasında TMDB_API_KEY eksik.")
        sys.exit(1)

    conn = get_db_conn()
    cur  = conn.cursor()
    cur.execute(
        """
        SELECT series_id, name
        FROM series
        WHERE poster_path IS NULL OR poster_path = ''
           OR backdrop_path IS NULL OR backdrop_path = ''
        ORDER BY series_id;
        """
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()

    total = len(rows)
    if total == 0:
        print("✓ Görseli eksik dizi yok, işlem tamamlandı.")
        return

    print(f"{total} dizinin görseli eksik, TMDB'den yeniden çekiliyor...\n")
    fixed = 0
    still_missing = 0

    for i, (series_id, name) in enumerate(rows, 1):
        poster, backdrop = fetch_images(series_id)

        if not poster and not backdrop:
            print(f"  [{i:03d}/{total}] ⚠  {name} — TMDB'de de görsel yok")
            still_missing += 1
            continue

        conn2 = get_db_conn()
        cur2  = conn2.cursor()
        try:
            cur2.execute(
                """
                UPDATE series
                SET
                    poster_path   = COALESCE(%s, poster_path),
                    backdrop_path = COALESCE(%s, backdrop_path)
                WHERE series_id = %s;
                """,
                (poster, backdrop, series_id),
            )
            conn2.commit()
            fixed += 1
            print(
                f"  [{i:03d}/{total}] ✓  {name}"
                f"  poster={'✓' if poster else '✗'}  backdrop={'✓' if backdrop else '✗'}"
            )
        except Exception as e:
            conn2.rollback()
            print(f"  [{i:03d}/{total}] ✗  {name} — DB hatası: {e}")
            still_missing += 1
        finally:
            cur2.close()
            conn2.close()

        time.sleep(0.12)

    print(f"\n{'='*50}")
    print(f"  ✓ Düzeltilen dizi   : {fixed}")
    print(f"  ⚠ Hâlâ eksik       : {still_missing}")
    print(f"{'='*50}")


if __name__ == "__main__":
    main()
