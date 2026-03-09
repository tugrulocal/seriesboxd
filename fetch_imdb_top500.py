"""
fetch_imdb_top500.py
─────────────────────────────────────────────────────────────────────
Seriesboxd — IMDb Top 500 Import & Smart Update Script

Akış:
  0. .env doğrula, DB schema migration (imdb_id, origin_country, original_language, first_air_date)
  Faz 0. Mevcut dizileri filtrele — yeni kurallara uymayan kayıtları DB'den sil
  Faz 1. IMDb TSV indir / cache'den yükle → nitelikli havuz
  Faz 2. Mevcut dizilerin eksik imdb_id'lerini TMDB external_ids ile doldur
  Faz 3. Mevcut dizilerin rating + vote_count'ını IMDb verileriyle UPDATE et
  Faz 4. episodes.vote_average'ı IMDb bölüm puanlarıyla UPDATE et
  Faz 5. IMDb rating >= 8.3 + filtreleri geçen, DB'de olmayan EN FAZLA 150 yeni diziyi ekle
  Faz 6. Özet rapor

Kalite Filtresi (her yerde geçerli):
  - Kids, Documentary, Reality, Talk, News türü → KESİNLİKLE ATLA
  - Animation (TMDB genre ID 16) → ülke/dil filtresinden muaf, diğer filtreler geçerli
  - origin_country IN [Tayland, Çin, HK, Hindistan, Güney Kore, Japonya, Orta Doğu/Arap ülkeleri, İran, Irak, Suriye] → ATLA
  - original_language IN ['th','zh','hi','ko','ja','ar','fa'] → ATLA
  - first_air_date yılı < 1990 → ATLA
  - number_of_episodes < 4 VE titleType != 'tvMiniSeries' → ATLA
  - IMDb numVotes < 13.000 → ATLA
  - Türkiye (TR) muaf

Koruma Modu:
  - Mevcut dizilerin overview, cast, crew, genres, poster alanlarına DOKUNULMAZ
  - Sadece rating, vote_count, imdb_id güncellenir
  - vote_count kolonuna artık IMDb numVotes yazılır (TMDB vote_count değil)
"""

import csv
import gzip
import os
import sys
import time

import psycopg2
import requests
from dotenv import load_dotenv

# ─────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────

load_dotenv()

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
DB_NAME      = os.getenv("DB_NAME")
DB_USER      = os.getenv("DB_USER")
DB_PASSWORD  = os.getenv("DB_PASSWORD")
DB_HOST      = os.getenv("DB_HOST")
DB_PORT      = os.getenv("DB_PORT", "5432")

BASE_URL       = "https://api.themoviedb.org/3"
IMDB_BASE_URL  = "https://datasets.imdbws.com"
IMDB_CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "imdb_cache")

# ── Filtre sabitleri ──────────────────────────────────────────────────
# Engellenmiş ülkeler (Türkiye hariç)
BLOCKED_COUNTRIES = {
    # Asya
    "IN", "KR", "JP", "TH", "CN", "HK",
    # Arap Birliği
    "DZ", "BH", "KM", "DJ", "EG", "IQ", "JO", "KW", "LB", "LY",
    "MA", "MR", "OM", "PS", "QA", "SA", "SO", "SD", "SY", "TN",
    "AE", "YE",
    # İran
    "IR",
}

# Engellenmiş diller (Türkçe hariç)
BLOCKED_LANGUAGES = {"hi", "ko", "ja", "th", "zh", "ar", "fa"}

# Reality/Talk/News → Animation dahil her şey engellenir
HARD_BLOCKED_GENRES = {"Reality", "Talk", "News"}

# Kids/Documentary → Animation dahil her şey engellenir
CONTENT_BLOCKED_GENRES = {"Kids", "Documentary"}

ANIMATION_GENRE_ID = 16
MIN_VOTES          = 13_000    # IMDb numVotes eşiği
MIN_RATING         = 7.6
MAX_RATING         = 8.3      # Yeni ekleme için maksimum IMDb puanı
MAX_NEW_ADDS       = 150       # Tek çalıştırmada eklenecek maks. yeni dizi


def _validate_env():
    required = {
        "DB_NAME": DB_NAME, "DB_USER": DB_USER, "DB_PASSWORD": DB_PASSWORD,
        "DB_HOST": DB_HOST, "TMDB_API_KEY": TMDB_API_KEY,
    }
    missing = [k for k, v in required.items() if not v]
    if missing:
        print(f"[HATA] .env dosyasında şu değişkenler eksik: {', '.join(missing)}")
        print("Proje kökünde .env dosyası oluşturun. Örnek:")
        print("  DB_NAME=seriesboxd\n  DB_USER=postgres\n  DB_PASSWORD=<şifre>")
        print("  DB_HOST=localhost\n  DB_PORT=5432\n  TMDB_API_KEY=<anahtar>")
        sys.exit(1)


# ─────────────────────────────────────────────────────────────────────
# DB Yardımcıları
# ─────────────────────────────────────────────────────────────────────

def get_db_conn():
    return psycopg2.connect(
        dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
        host=DB_HOST, port=DB_PORT,
    )


def setup_db():
    """Gerekli kolonları ve index'i ekler (idempotent — güvenle tekrar çalıştırılabilir)."""
    conn = get_db_conn()
    cur = conn.cursor()
    migrations = [
        "ALTER TABLE series ADD COLUMN IF NOT EXISTS imdb_id VARCHAR(20);",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_series_imdb_id ON series(imdb_id);",
        "ALTER TABLE series ADD COLUMN IF NOT EXISTS origin_country TEXT;",
        "ALTER TABLE series ADD COLUMN IF NOT EXISTS original_language VARCHAR(10);",
        "ALTER TABLE series ADD COLUMN IF NOT EXISTS first_air_date VARCHAR(20);",
    ]
    for sql in migrations:
        cur.execute(sql)
    conn.commit()
    cur.close()
    conn.close()
    print("✓ DB schema hazır (imdb_id, origin_country, original_language, first_air_date).", flush=True)


# ─────────────────────────────────────────────────────────────────────
# FAZ 1 — IMDb TSV İndirme & Top 500 Listesi
# ─────────────────────────────────────────────────────────────────────

def _download_tsv(filename: str) -> str:
    """TSV.gz dosyasını indir veya cache'den döndür."""
    os.makedirs(IMDB_CACHE_DIR, exist_ok=True)
    dest = os.path.join(IMDB_CACHE_DIR, filename)
    if os.path.exists(dest):
        print(f"  ↳ Cache'den yüklendi : {filename}", flush=True)
        return dest
    url = f"{IMDB_BASE_URL}/{filename}"
    print(f"  ↳ İndiriliyor        : {url}", flush=True)
    r = requests.get(url, stream=True, timeout=180)
    r.raise_for_status()
    with open(dest, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    print(f"  ✓ Tamamlandı         : {filename}", flush=True)
    return dest


def load_imdb_data() -> tuple[dict, dict, dict, dict]:
    """
    Döndürür:
      qualified        : {imdb_id: {"rating": float, "votes": int}}  — numVotes >= MIN_VOTES
      all_ep_ratings   : {ep_tconst: float}   — bölüm puanları için
      episode_map      : {ep_tconst: (parent_tconst, season_no, ep_no)}
      title_types      : {tconst: "tvSeries" | "tvMiniSeries"}
    """
    print("\n[FAZ 1] IMDb TSV verileri yükleniyor...", flush=True)

    # 1a. basics → TV tconst seti + titleType haritası
    basics_path = _download_tsv("title.basics.tsv.gz")
    tv_tconsts: dict[str, str] = {}  # {tconst: titleType}
    with gzip.open(basics_path, "rt", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            if row["titleType"] in ("tvSeries", "tvMiniSeries"):
                tv_tconsts[row["tconst"]] = row["titleType"]
    print(f"  ✓ {len(tv_tconsts):,} TV başlığı (tvSeries + tvMiniSeries) bulundu.", flush=True)

    # 1b. ratings → numVotes >= MIN_VOTES filtresi
    ratings_path = _download_tsv("title.ratings.tsv.gz")
    all_ep_ratings: dict[str, float] = {}   # tüm IMDb puanları (bölümler dahil)
    qualified: dict[str, dict] = {}         # {tconst: {"rating": x, "votes": y}}
    with gzip.open(ratings_path, "rt", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            try:
                rating = float(row["averageRating"])
                votes  = int(row["numVotes"])
            except ValueError:
                continue
            all_ep_ratings[row["tconst"]] = rating
            if row["tconst"] in tv_tconsts and votes >= MIN_VOTES:
                qualified[row["tconst"]] = {"rating": rating, "votes": votes}

    print(
        f"  ✓ {len(qualified):,} dizi numVotes >= {MIN_VOTES:,} filtresini geçti.",
        flush=True,
    )
    new_candidates_count = sum(
        1 for v in qualified.values() if v["rating"] >= MIN_RATING
    )
    print(
        f"  ✓ Bunların {new_candidates_count:,} tanesi rating >= {MIN_RATING} eşiğinin üzerinde.",
        flush=True,
    )

    # 1c. episodes → bölüm eşleme tablosu (qualified havuzundaki diziler için)
    episode_path = _download_tsv("title.episode.tsv.gz")
    episode_map: dict[str, tuple[str, int, int]] = {}
    with gzip.open(episode_path, "rt", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="\t"):
            parent = row.get("parentTconst", "")
            if parent not in qualified:
                continue
            try:
                s_no = int(row["seasonNumber"])
                e_no = int(row["episodeNumber"])
            except (ValueError, TypeError):
                continue
            episode_map[row["tconst"]] = (parent, s_no, e_no)
    print(f"  ✓ {len(episode_map):,} bölüm eşlemesi yüklendi.", flush=True)

    return qualified, all_ep_ratings, episode_map, tv_tconsts


# ─────────────────────────────────────────────────────────────────────
# FAZ 2 — Mevcut Dizilere imdb_id Backfill
# ─────────────────────────────────────────────────────────────────────

def backfill_imdb_ids():
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT series_id FROM series WHERE imdb_id IS NULL;")
    rows = cur.fetchall()
    cur.close()
    conn.close()

    if not rows:
        print("\n[FAZ 2] Tüm dizilerin imdb_id'si zaten dolu, atlanıyor.", flush=True)
        return

    print(f"\n[FAZ 2] {len(rows)} diziye imdb_id backfill yapılıyor...", flush=True)
    for i, (series_id,) in enumerate(rows, 1):
        try:
            url  = f"{BASE_URL}/tv/{series_id}/external_ids?api_key={TMDB_API_KEY}"
            data = requests.get(url, timeout=10).json()
            imdb_id = data.get("imdb_id")
            if imdb_id:
                conn2 = get_db_conn()
                cur2  = conn2.cursor()
                cur2.execute(
                    "UPDATE series SET imdb_id = %s WHERE series_id = %s;",
                    (imdb_id, series_id),
                )
                conn2.commit()
                cur2.close()
                conn2.close()
                print(f"  [{i:03d}/{len(rows)}] ✓ {series_id} → {imdb_id}", flush=True)
            else:
                print(f"  [{i:03d}/{len(rows)}] ⚠ {series_id}: imdb_id bulunamadı", flush=True)
            time.sleep(0.12)
        except Exception as e:
            print(f"  [{i:03d}/{len(rows)}] ✗ {series_id} hata: {e}", flush=True)


# ─────────────────────────────────────────────────────────────────────
# FAZ 3 — Mevcut Dizi Puanlarını Güncelle
# ─────────────────────────────────────────────────────────────────────

def update_series_ratings(qualified: dict) -> int:
    """
    Mevcut dizilerin rating ve vote_count'ını IMDb verisiyle günceller.
    vote_count → IMDb numVotes (TMDB vote_count değil)
    """
    conn = get_db_conn()
    cur  = conn.cursor()
    cur.execute("SELECT series_id, imdb_id FROM series WHERE imdb_id IS NOT NULL;")
    existing = cur.fetchall()

    updated = 0
    for series_id, imdb_id in existing:
        if imdb_id in qualified:
            info = qualified[imdb_id]
            cur.execute(
                "UPDATE series SET rating = %s, vote_count = %s WHERE series_id = %s;",
                (info["rating"], info["votes"], series_id),
            )
            updated += 1

    conn.commit()
    cur.close()
    conn.close()
    print(
        f"\n[FAZ 3] {updated} mevcut dizinin rating + vote_count'ı IMDb verisiyle güncellendi.",
        flush=True,
    )
    return updated


# ─────────────────────────────────────────────────────────────────────
# FAZ 4 — Bölüm Puanlarını Güncelle
# ─────────────────────────────────────────────────────────────────────

def update_episode_ratings(episode_map: dict, all_ep_ratings: dict) -> int:
    # {(parent_imdb_id, season_no, ep_no): rating}
    lookup: dict[tuple, float] = {}
    for ep_tconst, (parent, s, e) in episode_map.items():
        if ep_tconst in all_ep_ratings:
            lookup[(parent, s, e)] = all_ep_ratings[ep_tconst]

    conn = get_db_conn()
    cur  = conn.cursor()
    cur.execute("SELECT series_id, imdb_id FROM series WHERE imdb_id IS NOT NULL;")
    series_rows = cur.fetchall()

    ep_updated = 0
    for series_id, imdb_id in series_rows:
        cur.execute(
            "SELECT season_id, season_number FROM seasons WHERE series_id = %s;",
            (series_id,),
        )
        for season_id, season_number in cur.fetchall():
            cur.execute(
                "SELECT episode_id, episode_number FROM episodes WHERE season_id = %s;",
                (season_id,),
            )
            for episode_id, episode_number in cur.fetchall():
                key = (imdb_id, season_number, episode_number)
                if key in lookup:
                    cur.execute(
                        "UPDATE episodes SET vote_average = %s WHERE episode_id = %s;",
                        (lookup[key], episode_id),
                    )
                    ep_updated += 1

    conn.commit()
    cur.close()
    conn.close()
    print(
        f"\n[FAZ 4] {ep_updated:,} bölümün vote_average'ı IMDb puanıyla güncellendi.",
        flush=True,
    )
    return ep_updated


# ─────────────────────────────────────────────────────────────────────
# Kalite Filtresi Yardımcıları
# ─────────────────────────────────────────────────────────────────────

def _apply_filters(d: dict, title_type: str) -> tuple[bool, str]:
    """
    Tüm kalite filtrelerini uygular.
    Döndürür: (geçti: bool, sebep: str)
    """
    genre_ids   = {g["id"]   for g in d.get("genres", [])}
    genre_names = {g["name"] for g in d.get("genres", [])}
    is_animation = ANIMATION_GENRE_ID in genre_ids

    # 1. Reality / Talk / News — Animation dahil her şey engellenir
    hard_hit = genre_names & HARD_BLOCKED_GENRES
    if hard_hit:
        return False, f"Tür filtresi ({', '.join(sorted(hard_hit))})"

    # 2. Kids / Documentary — Animation dahil her şey engellenir
    content_hit = genre_names & CONTENT_BLOCKED_GENRES
    if content_hit:
        return False, f"İçerik filtresi ({', '.join(sorted(content_hit))})"

    # 3. Ülke / Dil filtresi — Animation muaf
    if not is_animation:
        countries = set(d.get("origin_country") or [])
        lang      = d.get("original_language", "")
        overlap   = countries & BLOCKED_COUNTRIES
        if overlap:
            return False, f"Ülke filtresi ({', '.join(sorted(overlap))})"
        if lang in BLOCKED_LANGUAGES:
            return False, f"Dil filtresi ({lang})"

    # 4. Yıl filtresi — 1990 öncesi
    first_air = d.get("first_air_date") or ""
    if first_air:
        try:
            year = int(first_air[:4])
            if year < 1990:
                return False, f"Yıl filtresi ({year} < 1990)"
        except ValueError:
            pass

    # 5. Bölüm sayısı filtresi
    n_ep = d.get("number_of_episodes") or 0
    if n_ep < 4 and title_type != "tvMiniSeries":
        return False, f"Az bölüm ({n_ep} < 4, tvSeries)"

    return True, ""


# ─────────────────────────────────────────────────────────────────────
# FAZ 5 — Yeni Dizi Detay Import
# ─────────────────────────────────────────────────────────────────────

def _fetch_tmdb_detail_with_fallback(tmdb_id: int) -> dict | None:
    """
    Önce tr-TR ile detay çeker.
    poster_path veya backdrop_path null gelirse en-US ile tekrar dener
    ve null alanları doldurur. Her iki çekimde de null kalırsa olduğu gibi bırakır.
    """
    primary: dict | None = None

    for lang in ("tr-TR", "en-US"):
        url = f"{BASE_URL}/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language={lang}"
        try:
            d = requests.get(url, timeout=15).json()
        except Exception:
            time.sleep(0.1)
            continue

        if "id" not in d:
            return None

        if lang == "tr-TR":
            primary = d
            # İkisi de dolu ise fallback'e gerek yok
            if primary.get("poster_path") and primary.get("backdrop_path"):
                return primary
            # Yoksa en-US ile devam et
            time.sleep(0.1)
        else:
            # en-US — sadece null olan alanları doldur, overview/isim gibi alanları bozma
            if primary is None:
                return d
            if not primary.get("poster_path"):
                primary["poster_path"] = d.get("poster_path")
            if not primary.get("backdrop_path"):
                primary["backdrop_path"] = d.get("backdrop_path")
            return primary

    return primary  # en kötü ihtimalle tr-TR sonucunu döndür


def import_new_series(imdb_id: str, tmdb_id: int, imdb_rating: float,
                      imdb_votes: int, index: int, total: int) -> bool:
    """series + seasons + episodes + cast + crew tam import. vote_count = IMDb numVotes."""
    conn = get_db_conn()
    cur  = conn.cursor()
    try:
        d = _fetch_tmdb_detail_with_fallback(tmdb_id)
        if not d:
            print(f"  [{index:03d}/{total}] ✗ {tmdb_id}: TMDB detay alınamadı", flush=True)
            return False

        networks        = ", ".join(n["name"] for n in d.get("networks",   []))
        created_by      = ", ".join(c["name"] for c in d.get("created_by", []))
        genres          = ", ".join(g["name"] for g in d.get("genres",     []))
        origin_country  = ", ".join(d.get("origin_country") or [])
        original_lang   = d.get("original_language", "")
        first_air_date  = d.get("first_air_date", "")

        # series upsert — conflict: imdb_id
        cur.execute(
            """
            INSERT INTO series
                (series_id, imdb_id, name, rating, overview,
                 poster_path, backdrop_path, status, networks,
                 created_by, genres, vote_count,
                 origin_country, original_language, first_air_date)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (imdb_id) DO NOTHING;
            """,
            (
                d["id"], imdb_id, d.get("name"), imdb_rating,
                d.get("overview"), d.get("poster_path"), d.get("backdrop_path"),
                d.get("status"), networks, created_by, genres,
                imdb_votes,
                origin_country, original_lang, first_air_date,
            ),
        )

        # Sezonlar & Bölümler
        for s in d.get("seasons", []):
            s_num = s["season_number"]
            if s_num == 0:
                continue
            season_url = (
                f"{BASE_URL}/tv/{tmdb_id}/season/{s_num}"
                f"?api_key={TMDB_API_KEY}&language=tr-TR"
            )
            s_detail = requests.get(season_url, timeout=15).json()
            time.sleep(0.05)
            if "season_number" not in s_detail:
                continue

            cur.execute(
                """
                INSERT INTO seasons
                    (series_id, season_number, name, overview, air_date, poster_path)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING season_id;
                """,
                (
                    d["id"], s_num, s.get("name"), s.get("overview"),
                    s.get("air_date"), s.get("poster_path"),
                ),
            )
            db_season_id = cur.fetchone()[0]

            for ep in s_detail.get("episodes", []):
                cur.execute(
                    """
                    INSERT INTO episodes
                        (season_id, episode_number, name, overview,
                         air_date, runtime, still_path, vote_average)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING;
                    """,
                    (
                        db_season_id, ep.get("episode_number"), ep.get("name"),
                        ep.get("overview"), ep.get("air_date"), ep.get("runtime"),
                        ep.get("still_path"), ep.get("vote_average"),
                    ),
                )

        # Cast
        credits_url = f"{BASE_URL}/tv/{tmdb_id}/credits?api_key={TMDB_API_KEY}&language=tr-TR"
        credits_data = requests.get(credits_url, timeout=15).json()
        time.sleep(0.05)

        cur.execute("DELETE FROM series_cast WHERE series_id = %s", (d["id"],))
        for actor in credits_data.get("cast", [])[:20]:
            cur.execute(
                """
                INSERT INTO series_cast (series_id, name, character, profile_path, credit_order)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (d["id"], actor.get("name"), actor.get("character"),
                 actor.get("profile_path"), actor.get("order")),
            )

        # Crew
        cur.execute("DELETE FROM series_crew WHERE series_id = %s", (d["id"],))
        for crew in credits_data.get("crew", []):
            if crew.get("department") in ("Directing", "Writing", "Production", "Creator"):
                cur.execute(
                    """
                    INSERT INTO series_crew (series_id, name, job, department, profile_path)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (d["id"], crew.get("name"), crew.get("job"),
                     crew.get("department"), crew.get("profile_path")),
                )

        conn.commit()
        print(
            f"  [{index:03d}/{total}] ✓ {d.get('name')} eklendi "
            f"(IMDb: {imdb_rating})",
            flush=True,
        )
        return True

    except Exception as e:
        conn.rollback()
        print(f"  [{index:03d}/{total}] ✗ {tmdb_id} hata: {e}", flush=True)
        return False
    finally:
        cur.close()
        conn.close()


# ─────────────────────────────────────────────────────────────────────
# Ana Akış
# ─────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────
# FAZ 0 — Mevcut Dizileri Temizle
# ─────────────────────────────────────────────────────────────────────

def _delete_series_cascade(cur, series_id: int):
    """Bir diziyi ve tüm bağlı kayıtları FK sırasına göre siler."""
    # Kullanıcı tabloları
    for tbl in ("user_activity", "user_series_activity", "user_ratings",
                "user_series_reviews", "user_favorites"):
        cur.execute(f"DELETE FROM {tbl} WHERE series_id = %s;", (series_id,))
    # list_items
    cur.execute("DELETE FROM list_items WHERE series_id = %s;", (series_id,))
    # episode bağımlıları
    cur.execute(
        """
        DELETE FROM user_episode_ratings
        WHERE episode_id IN (
            SELECT e.episode_id FROM episodes e
            JOIN seasons s ON e.season_id = s.season_id
            WHERE s.series_id = %s
        );
        """,
        (series_id,),
    )
    cur.execute(
        """
        DELETE FROM user_episode_reviews
        WHERE episode_id IN (
            SELECT e.episode_id FROM episodes e
            JOIN seasons s ON e.season_id = s.season_id
            WHERE s.series_id = %s
        );
        """,
        (series_id,),
    )
    # episodes & seasons
    cur.execute(
        "DELETE FROM episodes WHERE season_id IN "
        "(SELECT season_id FROM seasons WHERE series_id = %s);",
        (series_id,),
    )
    cur.execute("DELETE FROM seasons  WHERE series_id = %s;", (series_id,))
    cur.execute("DELETE FROM series_cast WHERE series_id = %s;", (series_id,))
    cur.execute("DELETE FROM series_crew WHERE series_id = %s;", (series_id,))
    cur.execute("DELETE FROM series WHERE series_id = %s;", (series_id,))


def cleanup_existing_series(title_types: dict) -> dict:
    """
    Mevcut dizileri yeni kurallara göre filtreler.
    Kural dışı olanlar DB'den tamamen silinir.
    Döndürür: {"removed": int, filtre detayları}
    """
    conn = get_db_conn()
    cur  = conn.cursor()
    cur.execute("SELECT series_id, name FROM series;")
    all_series = cur.fetchall()
    cur.close()
    conn.close()

    total = len(all_series)
    print(f"\n[FAZ 0] {total} mevcut dizi filtreye tabi tutuluyor...", flush=True)

    removed        = 0
    filter_counts  = {"country_language": 0, "content": 0, "year": 0, "episode": 0}

    for i, (series_id, name) in enumerate(all_series, 1):
        try:
            detail_url = f"{BASE_URL}/tv/{series_id}?api_key={TMDB_API_KEY}&language=tr-TR"
            d = requests.get(detail_url, timeout=15).json()
            time.sleep(0.12)
        except Exception as e:
            print(f"  [{i:03d}/{total}] ✗ {name}: TMDB hatası — {e}", flush=True)
            continue

        if "id" not in d:
            continue

        title_type = title_types.get("", "tvSeries")  # fallback
        # imdb_id varsa title_types'dan al
        ext_imdb = None
        try:
            ext_url  = f"{BASE_URL}/tv/{series_id}/external_ids?api_key={TMDB_API_KEY}"
            ext_data = requests.get(ext_url, timeout=10).json()
            ext_imdb = ext_data.get("imdb_id", "")
            if ext_imdb:
                title_type = title_types.get(ext_imdb, "tvSeries")
            time.sleep(0.08)
        except Exception:
            pass

        passed, reason = _apply_filters(d, title_type)
        if not passed:
            conn2 = get_db_conn()
            cur2  = conn2.cursor()
            try:
                _delete_series_cascade(cur2, series_id)
                conn2.commit()
                removed += 1
                # sınıflandır
                if "İçerik filtresi" in reason or "Tür filtresi" in reason:
                    filter_counts["content"] += 1
                elif "Yıl" in reason:
                    filter_counts["year"] += 1
                elif "bölüm" in reason:
                    filter_counts["episode"] += 1
                else:
                    filter_counts["country_language"] += 1
                print(f"  [{i:03d}/{total}] 🗑  {name} SİLİNDİ — {reason}", flush=True)
            except Exception as e:
                conn2.rollback()
                print(f"  [{i:03d}/{total}] ✗ {name} silinemedi: {e}", flush=True)
            finally:
                cur2.close()
                conn2.close()
        else:
            print(f"  [{i:03d}/{total}] ✓ {name}", flush=True)

    print(
        f"\n  Temizlik tamamlandı: {removed} dizi silindi "
        f"(ülke/dil: {filter_counts['country_language']}, "
        f"içerik: {filter_counts['content']}, "
        f"yıl: {filter_counts['year']}, "
        f"bölüm: {filter_counts['episode']})",
        flush=True,
    )
    return {"removed": removed, **filter_counts}


# ─────────────────────────────────────────────────────────────────────
# Ana Akış
# ─────────────────────────────────────────────────────────────────────

def main():
    _validate_env()

    print("=" * 60)
    print("  SERIESBOXD — IMDb Top 500 Import / Smart Update")
    print("=" * 60, flush=True)

    # 0. Schema migration
    setup_db()

    # 1. IMDb TSV yükle
    qualified, all_ep_ratings, episode_map, title_types = load_imdb_data()

    # FAZ 0. Mevcut dizileri temizle
    cleanup_stats = cleanup_existing_series(title_types)

    # 2. Mevcut dizilere imdb_id backfill
    backfill_imdb_ids()

    # 3. Mevcut dizi puanlarını + vote_count'ı güncelle
    updated_count = update_series_ratings(qualified)

    # 4. Bölüm puanlarını güncelle
    update_episode_ratings(episode_map, all_ep_ratings)

    # 5. Yeni dizileri ekle — rating >= 8.3, maks 150
    conn = get_db_conn()
    cur  = conn.cursor()
    cur.execute("SELECT imdb_id FROM series WHERE imdb_id IS NOT NULL;")
    existing_imdb_ids = {row[0] for row in cur.fetchall()}
    cur.close()
    conn.close()

    # Adaylar: qualified içinde, DB'de olmayan, rating >= MIN_RATING, sıralı puana göre
    new_candidates = [
        (iid, info)
        for iid, info in sorted(
            qualified.items(), key=lambda x: x[1]["rating"], reverse=True
        )
        if iid not in existing_imdb_ids and info["rating"] >= MIN_RATING
    ]
    total_new = len(new_candidates)
    print(
        f"\n[FAZ 5] {total_new} yeni aday var (rating >= {MIN_RATING}), "
        f"en fazla {MAX_NEW_ADDS} tanesi eklenecek...",
        flush=True,
    )

    added_count   = 0
    no_tmdb_match = 0
    filter_counts = {"country_language": 0, "content": 0, "year": 0, "episode_count": 0}

    for processed, (imdb_id, info) in enumerate(new_candidates, 1):
        if added_count >= MAX_NEW_ADDS:
            print(f"  ✓ {MAX_NEW_ADDS} dizi ekleme hedefine ulaşıldı, duruluyor.", flush=True)
            break

        imdb_rating = info["rating"]
        imdb_votes  = info["votes"]

        # TMDB eşleştirme
        try:
            find_url  = f"{BASE_URL}/find/{imdb_id}?external_source=imdb_id&api_key={TMDB_API_KEY}"
            find_data = requests.get(find_url, timeout=10).json()
            time.sleep(0.1)
        except Exception as e:
            print(f"  [{processed:03d}/{total_new}] ✗ {imdb_id} find hatası: {e}", flush=True)
            no_tmdb_match += 1
            continue

        tv_results = find_data.get("tv_results", [])
        if not tv_results:
            print(f"  [{processed:03d}/{total_new}] ⚠ {imdb_id}: TMDB eşleşmesi yok", flush=True)
            no_tmdb_match += 1
            continue

        tmdb_id = tv_results[0]["id"]

        # Detay çek (filtre için) — import_new_series içinde tekrar çekilmez
        try:
            detail_url = f"{BASE_URL}/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=tr-TR"
            d = requests.get(detail_url, timeout=15).json()
            time.sleep(0.1)
        except Exception as e:
            print(f"  [{processed:03d}/{total_new}] ✗ {imdb_id} detay hatası: {e}", flush=True)
            no_tmdb_match += 1
            continue

        if "id" not in d:
            no_tmdb_match += 1
            continue

        # Kalite kapısı
        title_type = title_types.get(imdb_id, "tvSeries")
        passed, reason = _apply_filters(d, title_type)

        if not passed:
            if "İçerik filtresi" in reason or "Tür filtresi" in reason:
                filter_counts["content"] += 1
            elif "Yıl" in reason:
                filter_counts["year"] += 1
            elif "bölüm" in reason:
                filter_counts["episode_count"] += 1
            else:
                filter_counts["country_language"] += 1
            print(
                f"  [{processed:03d}/{total_new}] ✗ {d.get('name', imdb_id)} — {reason}",
                flush=True,
            )
            continue

        # Import
        success = import_new_series(
            imdb_id, tmdb_id, imdb_rating, imdb_votes, processed, total_new
        )
        if success:
            added_count += 1
        time.sleep(0.1)

    # 6. Özet Rapor
    total_filtered = sum(filter_counts.values())
    print()
    print("=" * 60)
    print("  İŞLEM TAMAMLANDI — ÖZET RAPOR")
    print("=" * 60)
    print(f"  [Temizlik]  DB'den silinen dizi         : {cleanup_stats['removed']}")
    print(f"  [Faz 3]     Puan güncellenen dizi        : {updated_count}")
    print(f"  [Faz 5]     Yeni eklenen dizi            : {added_count} / {MAX_NEW_ADDS}")
    print(f"  [Faz 5]     Filtreden elenen (yeni)      : {total_filtered}")
    print(f"                - Ülke / Dil              : {filter_counts['country_language']}")
    print(f"                - Kids / Documentary       : {filter_counts['content']}")
    print(f"                - Yıl < 1990              : {filter_counts['year']}")
    print(f"                - Az bölüm (<4)           : {filter_counts['episode_count']}")
    print(f"  [Faz 5]     TMDB eşleşmesi bulunamayan  : {no_tmdb_match}")
    print("=" * 60, flush=True)


if __name__ == "__main__":
    main()
