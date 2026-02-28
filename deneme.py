import requests
import psycopg2
import time

# 1. TMDB Ayarları
API_KEY = "8ebd0cda4cf50b4a7f730c2164931769"
BASE_URL = "https://api.themoviedb.org/3"

def dizi_kaydet(dizi_adi):
    # ARAMA: Önce dizinin ID'sini bulalım
    search_url = f"{BASE_URL}/search/tv?api_key={API_KEY}&query={dizi_adi}&language=tr-TR"
    search_data = requests.get(search_url).json()
    
    if not search_data['results']:
        print(f"'{dizi_adi}' bulunamadı.")
        return

    tmdb_id = search_data['results'][0]['id']
    
    # DETAY: Dizinin tüm künyesini (networks, created_by, status) çekelim
    detail_url = f"{BASE_URL}/tv/{tmdb_id}?api_key={API_KEY}&language=tr-TR"
    d = requests.get(detail_url).json()

    # Verileri DB formatına hazırlayalım
    networks = ", ".join([n['name'] for n in d.get('networks', [])])
    created_by = ", ".join([c['name'] for c in d.get('created_by', [])])
    genres = ", ".join([g['name'] for g in d.get('genres', [])])
    
    try:
        conn = psycopg2.connect(
            dbname="seriesboxd", user="postgres", password="1234", host="localhost", port="5432"
        )
        cur = conn.cursor()

        # --- 0. OYUNCU TABLOSUNU OLUŞTUR (Eğer yoksa) ---
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
        
        # --- 0.1 EKİP (CREW) TABLOSUNU OLUŞTUR ---
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

        # --- 0.2 GENRES KOLONUNU EKLE (Eğer yoksa) ---
        try:
            cur.execute("ALTER TABLE series ADD COLUMN IF NOT EXISTS genres TEXT;")
            conn.commit()
        except Exception as e:
            conn.rollback()

        # --- 0.3 BACKDROP KOLONUNU EKLE (Eğer yoksa) ---
        try:
            cur.execute("ALTER TABLE series ADD COLUMN IF NOT EXISTS backdrop_path VARCHAR(255);")
            conn.commit()
        except Exception as e:
            conn.rollback()

        # --- 0.4 KULLANICI LİSTELERİ TABLOSU ---
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_lists (
                list_id SERIAL PRIMARY KEY,
                user_id INTEGER DEFAULT 1,
                name VARCHAR(255),
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # --- 0.5 LİSTE ELEMANLARI TABLOSU ---
        cur.execute("""
            CREATE TABLE IF NOT EXISTS list_items (
                item_id SERIAL PRIMARY KEY,
                list_id INTEGER REFERENCES user_lists(list_id) ON DELETE CASCADE,
                series_id INTEGER,
                added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(list_id, series_id)
            );
        """)

        # Varsayılan listeleri oluştur (Eğer hiç liste yoksa)
        cur.execute("SELECT COUNT(*) FROM user_lists")
        if cur.fetchone()[0] == 0:
            cur.execute("INSERT INTO user_lists (name, description) VALUES ('Favoriler', 'En sevdiğim diziler'), ('İzlenecekler', 'Daha sonra izleyeceğim diziler')")
            conn.commit()
            print("-> Varsayılan listeler (Favoriler, İzlenecekler) oluşturuldu.")

        # --- 0.6 KULLANICI PUANLARI TABLOSU ---
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_ratings (
                rating_id SERIAL PRIMARY KEY,
                user_id INTEGER DEFAULT 1,
                series_id INTEGER,
                score INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, series_id)
            );
        """)

        # --- 1. ANA TABLOYU (SERIES) GÜNCELLE ---
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
            d['id'], d['name'], d['vote_average'], d['overview'], 
            d['poster_path'], d.get('backdrop_path'), d['status'], networks, created_by, genres
        ))

        # --- 2. SEZONLARI VE BÖLÜMLERİ İŞLE ---
        # YENİ: Duplicate (çift) kayıtları önlemek için önce temizlik yapıyoruz.
        # 1. Önce bu diziye ait bölümleri sil
        cur.execute("""
            DELETE FROM episodes 
            WHERE season_id IN (SELECT season_id FROM seasons WHERE series_id = %s)
        """, (tmdb_id,))
        # 2. Sonra sezonları sil
        cur.execute("DELETE FROM seasons WHERE series_id = %s", (tmdb_id,))

        for s in d.get('seasons', []):
            s_num = s['season_number']
            # Özel bölümleri (Season 0) genellikle atlarız, ama istersen tutabilirsin
            if s_num == 0: continue 

            # Sezon Detayı (Bölümleri almak için şart)
            season_url = f"{BASE_URL}/tv/{tmdb_id}/season/{s_num}?api_key={API_KEY}&language=tr-TR"
            s_detail = requests.get(season_url).json()

            # SEZON KAYDET (Artık temiz olduğu için direkt INSERT yapabiliriz)
            cur.execute("""
                INSERT INTO seasons (series_id, season_number, name, overview, air_date, poster_path)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING season_id;
            """, (tmdb_id, s_num, s['name'], s['overview'], s['air_date'], s['poster_path']))
            
            result = cur.fetchone()
            db_season_id = result[0]

            # BÖLÜMLERİ KAYDET
            for ep in s_detail.get('episodes', []):
                cur.execute("""
                    INSERT INTO episodes (season_id, episode_number, name, overview, air_date, runtime, still_path)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING;
                """, (
                    db_season_id, ep['episode_number'], ep['name'], 
                    ep['overview'], ep['air_date'], ep.get('runtime'), ep.get('still_path')
                ))
            
            print(f"-> {d['name']} {s['name']} ve {len(s_detail.get('episodes', []))} bölüm kaydedildi.")
            time.sleep(0.1) # TMDB'yi çok yormayalım (Rate Limit)

        # --- 3. OYUNCULARI (CAST) KAYDET ---
        credits_url = f"{BASE_URL}/tv/{tmdb_id}/credits?api_key={API_KEY}&language=tr-TR"
        credits_data = requests.get(credits_url).json()
        
        # Önce eski oyuncu kaydı varsa temizle (Güncel tutmak için)
        cur.execute("DELETE FROM series_cast WHERE series_id = %s", (tmdb_id,))
        
        for actor in credits_data.get('cast', [])[:20]: # İlk 20 oyuncuyu alalım
            cur.execute("""
                INSERT INTO series_cast (series_id, name, character, profile_path, credit_order)
                VALUES (%s, %s, %s, %s, %s)
            """, (
                tmdb_id, actor['name'], actor['character'], 
                actor.get('profile_path'), actor['order']
            ))
        print(f"-> {len(credits_data.get('cast', [])[:20])} oyuncu eklendi.")

        # --- 4. EKİBİ (CREW) KAYDET ---
        # Önce eskileri temizle
        cur.execute("DELETE FROM series_crew WHERE series_id = %s", (tmdb_id,))
        
        # Crew listesi çok uzun olabilir, önemli departmanları veya ilk 30 kişiyi alalım
        important_depts = ['Directing', 'Writing', 'Production', 'Creator']
        filtered_crew = [c for c in credits_data.get('crew', []) if c['known_for_department'] in important_depts or c['job'] == 'Executive Producer']
        
        for person in filtered_crew[:30]: # Veritabanını şişirmemek için limit
            cur.execute("""
                INSERT INTO series_crew (series_id, name, job, department, profile_path)
                VALUES (%s, %s, %s, %s, %s)
            """, (tmdb_id, person['name'], person['job'], person['known_for_department'], person.get('profile_path')))
        print(f"-> {len(filtered_crew[:30])} teknik ekip eklendi.")

        conn.commit()
        print(f"İŞLEM TAMAM: '{d['name']}' tüm gen haritasıyla DB'ye işlendi.\n")

    except Exception as e:
        print(f"HATA: {e}")
        if conn: conn.rollback()
    finally:
        if cur: cur.close()
        if conn: conn.close()

# Motoru Ateşle
diziler = ["The Last of Us", "Breaking Bad", "The Bear", "Lost", "Mahsun J","Dexter","Daredevil","Marvel's Daredevil"]
for dizi in diziler:
    dizi_kaydet(dizi)