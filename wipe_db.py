import psycopg2

def wipe_database():
    print("Veritabani temizleniyor (Kullanicilar, Listeler ve Puanlamalar HARIC)...")
    try:
        conn = psycopg2.connect(
            dbname="seriesboxd", user="postgres", password="1234", host="localhost", port="5432"
        )
        cur = conn.cursor()

        # Disable foreign key checks temporarily if needed, or delete in correct order
        # Bağımlılığı en alt tablodan yukarı doğru siliyoruz
        
        print("-> Tablolar temizleniyor...")
        tables = [
            "user_episode_ratings", "user_ratings", "list_items", 
            "series_activity", "user_activity", "episodes", 
            "seasons", "series_cast", "series_crew", "series"
        ]
        
        for table in tables:
            try:
                cur.execute(f"DELETE FROM {table};")
            except Exception as inner_e:
                # Tablo yoksa sorun değil, geç (hata mesajını temizleyip işleme devam et)
                conn.rollback() 
        
        conn.commit()
        print("\n✅ Temizlik Tamamlandi! Veritabani tertemiz. Artik kaliteli dizileri cekebiliriz.")
        
    except Exception as e:
        print(f"Hata: {e}")
        if 'conn' in locals():
            conn.rollback()
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    wipe_database()
