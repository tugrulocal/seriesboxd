"""
migrate_all.py  —  seasons, episodes, series_cast, series_crew → DigitalOcean
"""
import os, sys
import psycopg2, psycopg2.extras
from dotenv import load_dotenv
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

load_dotenv()

LOCAL_URL  = os.getenv("LOCAL_DATABASE_URL", "postgresql://postgres:1234@localhost:5432/seriesboxd")
REMOTE_URL = os.getenv("REMOTE_DATABASE_URL", "")
if not REMOTE_URL:
    sys.exit("HATA: REMOTE_DATABASE_URL tanımlı değil.")

parsed = urlparse(REMOTE_URL)
qs = parse_qs(parsed.query)
if "sslmode" not in qs:
    qs["sslmode"] = ["require"]
    REMOTE_URL = urlunparse(parsed._replace(query=urlencode({k: v[0] for k, v in qs.items()})))

BATCH = 200

DDLS = {
    "seasons": """CREATE TABLE IF NOT EXISTS seasons (
        season_id INTEGER PRIMARY KEY, series_id INTEGER, season_number INTEGER,
        name VARCHAR, overview TEXT, air_date DATE, poster_path VARCHAR);""",
    "episodes": """CREATE TABLE IF NOT EXISTS episodes (
        episode_id INTEGER PRIMARY KEY, season_id INTEGER, episode_number INTEGER,
        name VARCHAR, overview TEXT, air_date DATE, runtime INTEGER,
        still_path VARCHAR, vote_average NUMERIC(4,2));""",
    "series_cast": """CREATE TABLE IF NOT EXISTS series_cast (
        cast_id INTEGER PRIMARY KEY, series_id INTEGER, name VARCHAR,
        character VARCHAR, profile_path VARCHAR, credit_order INTEGER);""",
    "series_crew": """CREATE TABLE IF NOT EXISTS series_crew (
        crew_id INTEGER PRIMARY KEY, series_id INTEGER, name VARCHAR,
        job VARCHAR, department VARCHAR, profile_path VARCHAR);""",
}
COLS = {
    "seasons":     ["season_id","series_id","season_number","name","overview","air_date","poster_path"],
    "episodes":    ["episode_id","season_id","episode_number","name","overview","air_date","runtime","still_path","vote_average"],
    "series_cast": ["cast_id","series_id","name","character","profile_path","credit_order"],
    "series_crew": ["crew_id","series_id","name","job","department","profile_path"],
}

def migrate(lc, rc, rconn, tbl):
    cols = COLS[tbl]; pk = cols[0]
    sets = ", ".join(f"{c}=EXCLUDED.{c}" for c in cols[1:])
    sql  = f"INSERT INTO {tbl} ({','.join(cols)}) VALUES %s ON CONFLICT ({pk}) DO UPDATE SET {sets};"
    lc.execute(f"SELECT {','.join(cols)} FROM {tbl} ORDER BY {pk};")
    total = 0
    while True:
        rows = lc.fetchmany(BATCH)
        if not rows: break
        psycopg2.extras.execute_values(rc, sql, rows)
        rconn.commit(); total += len(rows)
        print(f"  [{tbl}] {total} satır aktarıldı...")
    return total

def main():
    print("Yerel DB bağlanıyor..."); lconn = psycopg2.connect(LOCAL_URL); lc = lconn.cursor()
    print("DO DB bağlanıyor...");    rconn = psycopg2.connect(REMOTE_URL); rc = rconn.cursor()
    for tbl, ddl in DDLS.items():
        print(f"\n=== {tbl} ===")
        rc.execute(ddl); rconn.commit()
        n = migrate(lc, rc, rconn, tbl)
        rc.execute(f"SELECT COUNT(*) FROM {tbl};")
        print(f"  Tamamlandı: {n} aktarıldı, uzak toplam: {rc.fetchone()[0]}")
    lconn.close(); rconn.close()
    print("\nMigration bitti!")

if __name__ == "__main__":
    main()