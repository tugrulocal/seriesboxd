import sys
import psycopg2
import time
import requests

API_KEY = "8ebd0cda4cf50b4a7f730c2164931769"
BASE_URL = "https://api.themoviedb.org/3"

def get_db_conn():
    return psycopg2.connect(
        dbname="seriesboxd", user="postgres", password="1234", host="localhost", port="5432"
    )

def setup_db():
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS series_cast (
            cast_id SERIAL PRIMARY KEY,
            series_id INTEGER,
            name VARCHAR(255),
            character VARCHAR(255),
            profile_path VARCHAR(255),
            credit_order INTEGER
        );
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS series_crew (
            crew_id SERIAL PRIMARY KEY,
            series_id INTEGER,
            name VARCHAR(255),
            job VARCHAR(255),
            department VARCHAR(255),
            profile_path VARCHAR(255)
        );
    """)
    conn.commit()
    cur.close()
    conn.close()

def get_top_500_ids():
    series_dict = {}

    print("TMDB'den populer diziler (Popular) çekiliyor...", flush=True)
    for page in range(1, 26): # 25 sayfa x 20 = 500
        try:
            url = f"{BASE_URL}/tv/popular?api_key={API_KEY}&language=tr-TR&page={page}"
            data = requests.get(url).json()
            for res in data.get('results', []):
                series_dict[res['id']] = res
            time.sleep(0.05)
        except Exception as e:
            print(f"Hata popular sayfa {page}: {e}")

    print("TMDB'den en yuksek puanli diziler (Top Rated) çekiliyor...", flush=True)
    for page in range(1, 26):
        try:
            url = f"{BASE_URL}/tv/top_rated?api_key={API_KEY}&language=tr-TR&page={page}"
            data = requests.get(url).json()
            for res in data.get('results', []):
                series_dict[res['id']] = res
            time.sleep(0.05)
        except Exception as e:
            print(f"Hata top_rated sayfa {page}: {e}")

    # En populerden aza doğru sirala
    sorted_series = sorted(series_dict.values(), key=lambda x: x.get('popularity', 0), reverse=True)
    
    # 500 dizi seç
    top_500 = sorted_series[:500]
    return [s['id'] for s in top_500]

def import_series(tmdb_id, index, total):
    conn = get_db_conn()
    cur = conn.cursor()
    
    try:
        detail_url = f"{BASE_URL}/tv/{tmdb_id}?api_key={API_KEY}&language=tr-TR"
        d = requests.get(detail_url).json()
        
        if 'id' not in d:
            print(f"[{index:03d}/{total}] Hata: {tmdb_id} verisi alinamadi.", flush=True)
            return

        networks = ", ".join([n['name'] for n in d.get('networks', [])])
        created_by = ", ".join([c['name'] for c in d.get('created_by', [])])
        genres = ", ".join([g['name'] for g in d.get('genres', [])])
        
        # 1. SERIES TABLOSU
        series_query = """
        INSERT INTO series (series_id, name, rating, overview, poster_path, backdrop_path, status, networks, created_by, genres) 
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (series_id) DO UPDATE SET
            status = EXCLUDED.status,
            networks = EXCLUDED.networks,
            created_by = EXCLUDED.created_by,
            rating = EXCLUDED.rating,
            genres = EXCLUDED.genres,
            backdrop_path = EXCLUDED.backdrop_path;
        """
        cur.execute(series_query, (
            d['id'], d['name'], d.get('vote_average'), d.get('overview'), 
            d.get('poster_path'), d.get('backdrop_path'), d.get('status'), networks, created_by, genres
        ))

        # 2. SEZONLAR VE BÖLÜMLER
        cur.execute("DELETE FROM episodes WHERE season_id IN (SELECT season_id FROM seasons WHERE series_id = %s)", (tmdb_id,))
        cur.execute("DELETE FROM seasons WHERE series_id = %s", (tmdb_id,))
        
        for s in d.get('seasons', []):
            s_num = s['season_number']
            if s_num == 0: continue 

            season_url = f"{BASE_URL}/tv/{tmdb_id}/season/{s_num}?api_key={API_KEY}&language=tr-TR"
            s_detail = requests.get(season_url).json()
            time.sleep(0.05)
            
            if 'season_number' not in s_detail:
                continue

            cur.execute("""
                INSERT INTO seasons (series_id, season_number, name, overview, air_date, poster_path)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING season_id;
            """, (tmdb_id, s_num, s.get('name'), s.get('overview'), s.get('air_date'), s.get('poster_path')))
            
            db_season_id = cur.fetchone()[0]

            for ep in s_detail.get('episodes', []):
                cur.execute("""
                    INSERT INTO episodes (season_id, episode_number, name, overview, air_date, runtime, still_path, vote_average)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING;
                """, (
                    db_season_id, ep.get('episode_number'), ep.get('name'), 
                    ep.get('overview'), ep.get('air_date'), ep.get('runtime'), ep.get('still_path'), ep.get('vote_average')
                ))

        # 3. OYUNCU (CAST) VE EKİP (CREW)
        credits_url = f"{BASE_URL}/tv/{tmdb_id}/credits?api_key={API_KEY}&language=tr-TR"
        credits_data = requests.get(credits_url).json()
        time.sleep(0.05)
        
        cur.execute("DELETE FROM series_cast WHERE series_id = %s", (tmdb_id,))
        for actor in credits_data.get('cast', [])[:20]:
            cur.execute("""
                INSERT INTO series_cast (series_id, name, character, profile_path, credit_order)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                tmdb_id, actor.get('name'), actor.get('character'), 
                actor.get('profile_path'), actor.get('order')
            ))
            
        cur.execute("DELETE FROM series_crew WHERE series_id = %s", (tmdb_id,))
        for crew in credits_data.get('crew', []):
            if crew.get('department') in ['Directing', 'Writing', 'Production', 'Creator']:
                cur.execute("""
                    INSERT INTO series_crew (series_id, name, job, department, profile_path)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    tmdb_id, crew.get('name'), crew.get('job'), 
                    crew.get('department'), crew.get('profile_path')
                ))

        conn.commit()
        
        print(f"[{index:03d}/{total}] ✓ {d.get('name')} DB'ye tam eklendi.", flush=True)
        
    except Exception as e:
        conn.rollback()
        print(f"[{index:03d}/{total}] X Hata ({tmdb_id}): {e}", flush=True)
    finally:
        cur.close()
        conn.close()

def main():
    print("--------------------------------------------------")
    print("TOP 500 DIZI ICERI AKTARMA ISLEMI BASLATILIYOR...")
    print("--------------------------------------------------\n", flush=True)
    setup_db()
    
    ids = get_top_500_ids()
    print(f"\nToplam {len(ids)} adet benzersiz populer dizi bulundu.")
    print("Diziler tum sezon/bolum/oyuncu detaylariyla aktariliyor (Bu islem 15-20 dk surebilir)...\n", flush=True)
    
    for i, tmdb_id in enumerate(ids, 1):
        import_series(tmdb_id, i, len(ids))
        time.sleep(0.1) # Rate limiting safety
        
    print("\n--------------------------------------------------")
    print("🎉 TUM ISLEM EKSIKSIZ TAMAMLANDI!")
    print("--------------------------------------------------")

if __name__ == "__main__":
    main()
