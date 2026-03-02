from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import psycopg2
from pydantic import BaseModel, EmailStr
from typing import Optional
from psycopg2.extras import RealDictCursor
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import re

# --- AUTH AYARLARI ---
SECRET_KEY = "seriesboxd-super-secret-key-2024-itu"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(user_id: int, username: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "username": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return {"user_id": int(payload["sub"]), "username": payload["username"]}
    except JWTError:
        return None

# 1. Uygulamayı sadece BİR kez oluşturuyoruz
app = FastAPI()

# 2. CORS ayarlarını hemen altına ekliyoruz (React ile konuşabilmesi için)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ListeEkleModel(BaseModel):
    name: str

class ListeItemModel(BaseModel):
    series_id: int

class RatingModel(BaseModel):
    series_id: int
    score: int

class ActivityModel(BaseModel):
    series_id: int
    season_id: Optional[int] = None
    episode_id: int
    activity_type: str  # 'watched' | 'watchlist'

class RegisterModel(BaseModel):
    username: str
    email: str
    password: str

class LoginModel(BaseModel):
    email: str
    password: str

# Veritabanı bağlantısı
def get_db_conn():
    return psycopg2.connect(
        dbname="seriesboxd", 
        user="postgres", 
        password="1234", 
        host="localhost"
    )

def ensure_users_table():
    """Uygulama açılışında users tablosunu ve gerekli kolonları oluştur."""
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            user_id   SERIAL PRIMARY KEY,
            username  VARCHAR(50)  UNIQUE NOT NULL,
            email     VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            avatar    VARCHAR(255) DEFAULT NULL,
            bio       TEXT DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # Episodes tablosuna vote_average kolonu ekle (yoksa)
    cur.execute("ALTER TABLE episodes ADD COLUMN IF NOT EXISTS vote_average NUMERIC(4,2) DEFAULT NULL;")
    # Kullanıcı bölüm puanları tablosu
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_episode_ratings (
            id        SERIAL PRIMARY KEY,
            user_id   INTEGER DEFAULT 1,
            episode_id INTEGER NOT NULL,
            score     INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, episode_id)
        );
    """)
    # Dizi yorumları/logları tablosu
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_series_reviews (
            review_id   SERIAL PRIMARY KEY,
            user_id     INTEGER DEFAULT 1,
            series_id   INTEGER NOT NULL,
            review_text TEXT NOT NULL,
            contains_spoiler BOOLEAN DEFAULT FALSE,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.commit()
    cur.close()
    conn.close()

ensure_users_table()

@app.get("/")
def ana_sayfa():
    return {"mesaj": "Seriesboxd API'sine Hoş Geldin! İTÜ'lü Mühendis İş Başında."}

@app.get("/diziler")
def tum_dizileri_getir():
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM series;")
    diziler = cur.fetchall()
    cur.close()
    conn.close()
    return diziler

@app.get("/top50")
def top_50_getir():
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM series WHERE rating IS NOT NULL ORDER BY rating DESC LIMIT 50;")
    diziler = cur.fetchall()
    cur.close()
    conn.close()
    return diziler

@app.get("/turler")
def turleri_getir():
    """Veritabanındaki tüm benzersiz türleri döndür."""
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT genres FROM series WHERE genres IS NOT NULL AND genres != ''")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    tur_seti = set()
    for row in rows:
        for tur in row[0].split(','):
            temiz = tur.strip()
            if temiz:
                tur_seti.add(temiz)
    return sorted(list(tur_seti))

@app.get("/arama")
def arama_yap(
    q: Optional[str] = None,
    min_rating: Optional[float] = None,
    max_rating: Optional[float] = None,
    tur: Optional[str] = None,
    siralama: Optional[str] = "rating_desc"
):
    """Gelişmiş arama: metin + puan aralığı + tür + sıralama."""
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    kosullar = []
    parametreler = []

    if q and q.strip():
        kosullar.append("LOWER(name) LIKE %s")
        parametreler.append(f"%{q.lower().strip()}%")

    if min_rating is not None:
        kosullar.append("rating >= %s")
        parametreler.append(min_rating)

    if max_rating is not None:
        kosullar.append("rating <= %s")
        parametreler.append(max_rating)

    if tur and tur.strip():
        turler = [t.strip() for t in tur.split(',') if t.strip()]
        if turler:
            tur_kosullari = ["genres ILIKE %s" for _ in turler]
            kosullar.append(f"({' OR '.join(tur_kosullari)})")
            for t in turler:
                parametreler.append(f"%{t}%")

    where_clause = "WHERE " + " AND ".join(kosullar) if kosullar else ""

    siralama_map = {
        "rating_desc": "rating DESC NULLS LAST",
        "rating_asc": "rating ASC NULLS LAST",
        "name_asc": "name ASC",
        "name_desc": "name DESC",
    }
    order_by = siralama_map.get(siralama, "rating DESC NULLS LAST")

    sorgu = f"SELECT * FROM series {where_clause} ORDER BY {order_by} LIMIT 200"
    cur.execute(sorgu, parametreler)
    diziler = cur.fetchall()
    cur.close()
    conn.close()
    return diziler

@app.get("/dizi/{series_id}")
def dizi_detay_getir(series_id: int):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # 1. Dizinin genel bilgilerini çek
    cur.execute("SELECT * FROM series WHERE series_id = %s", (series_id,))
    dizi = cur.fetchone()
    
    if not dizi:
        return {"hata": "Dizi bulunamadı"}

    # 2. Dizinin sezonlarını çek (Sezon numarasına göre sıralı)
    cur.execute("SELECT * FROM seasons WHERE series_id = %s ORDER BY season_number", (series_id,))
    sezonlar = cur.fetchall()

    # 3. Sezonlara ait bölümleri çek
    bolumler = []
    if sezonlar:
        season_ids = tuple([s['season_id'] for s in sezonlar])
        # SQL'de IN kullanımı için tuple boş olmamalı
        if season_ids:
            cur.execute("SELECT * FROM episodes WHERE season_id IN %s ORDER BY episode_number", (season_ids,))
            bolumler = cur.fetchall()

    # 4. Oyuncuları çek
    try:
        cur.execute("SELECT * FROM series_cast WHERE series_id = %s ORDER BY credit_order", (series_id,))
        oyuncular = cur.fetchall()
    except Exception as e:
        print(f"Cast tablosu hatası (Tablo eksik olabilir): {e}")
        conn.rollback() # Hatayı temizle ki bağlantı kopmasın
        oyuncular = []

    # 5. Ekibi (Crew) çek
    try:
        cur.execute("SELECT * FROM series_crew WHERE series_id = %s", (series_id,))
        ekip = cur.fetchall()
    except Exception as e:
        print(f"Crew tablosu hatası: {e}")
        conn.rollback()
        ekip = []

    cur.close()
    conn.close()
    
    return {"dizi": dizi, "sezonlar": sezonlar, "bolumler": bolumler, "cast": oyuncular, "crew": ekip}

# --- LİSTE YÖNETİMİ ---

@app.get("/lists")
def get_lists():
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM user_lists ORDER BY list_id")
    lists = cur.fetchall()
    cur.close()
    conn.close()
    return lists

@app.post("/lists")
def create_list(liste: ListeEkleModel):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO user_lists (name, user_id) VALUES (%s, 1) RETURNING list_id, name", (liste.name,))
    new_list = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"list_id": new_list[0], "name": new_list[1]}

@app.get("/lists/check/{series_id}")
def check_series_in_lists(series_id: int):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT list_id FROM list_items WHERE series_id = %s", (series_id,))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [row[0] for row in rows]

@app.post("/lists/{list_id}/items")
def add_item_to_list(list_id: int, item: ListeItemModel):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO list_items (list_id, series_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (list_id, item.series_id))
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(e)
    cur.close()
    conn.close()
    return {"status": "added"}

@app.delete("/lists/{list_id}/items/{series_id}")
def remove_item_from_list(list_id: int, series_id: int):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM list_items WHERE list_id = %s AND series_id = %s", (list_id, series_id))
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "removed"}

# --- AKTİVİTE (İZLENDİ / İZLEYECEĞİM) SİSTEMİ ---

@app.get("/activity/{series_id}")
def get_activity(series_id: int):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        "SELECT episode_id, season_id, activity_type FROM user_activity WHERE user_id = 1 AND series_id = %s",
        (series_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.post("/activity")
def set_activity(activity: ActivityModel):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO user_activity (user_id, series_id, season_id, episode_id, activity_type)
            VALUES (1, %s, %s, %s, %s)
            ON CONFLICT (user_id, episode_id, activity_type) DO NOTHING
            """,
            (activity.series_id, activity.season_id, activity.episode_id, activity.activity_type)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(e)
    cur.close()
    conn.close()
    return {"status": "ok"}

@app.delete("/activity/{episode_id}/{activity_type}")
def delete_activity(episode_id: int, activity_type: str):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM user_activity WHERE user_id = 1 AND episode_id = %s AND activity_type = %s",
        (episode_id, activity_type)
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "deleted"}

# --- PUANLAMA (RATING) SİSTEMİ ---

@app.get("/rating/{series_id}")
def get_user_rating(series_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT score FROM user_ratings WHERE series_id = %s AND user_id = %s", (series_id, user["user_id"]))
    row = cur.fetchone()
    cur.close()
    conn.close()
    return {"score": row[0] if row else None}

@app.post("/rating")
def set_user_rating(rating: RatingModel):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO user_ratings (user_id, series_id, score) VALUES (1, %s, %s)
            ON CONFLICT (user_id, series_id) DO UPDATE SET score = EXCLUDED.score
        """, (rating.series_id, rating.score))
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(e)
    cur.close()
    conn.close()
    return {"status": "success", "score": rating.score}

@app.delete("/rating/{series_id}")
def delete_user_rating(series_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM user_ratings WHERE user_id = %s AND series_id = %s", (user["user_id"], series_id))
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "deleted"}

# --- DİZİ BAZLI AKTİVİTE (WATCH / LIKE / WATCHLIST) ---

class SeriesActivityModel(BaseModel):
    series_id: int
    activity_type: str  # 'watched' | 'liked' | 'watchlist'

class ReviewModel(BaseModel):
    series_id: int
    review_text: str
    contains_spoiler: bool = False

@app.get("/series-activity/{series_id}")
def get_series_activity(series_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT activity_type FROM user_series_activity WHERE user_id = %s AND series_id = %s",
        (user["user_id"], series_id)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [row[0] for row in rows]  # ['watched', 'liked'] gibi

@app.post("/series-activity")
def set_series_activity(item: SeriesActivityModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO user_series_activity (user_id, series_id, activity_type)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, series_id, activity_type) DO NOTHING
            """,
            (user["user_id"], item.series_id, item.activity_type)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(e)
    cur.close()
    conn.close()
    return {"status": "ok"}

@app.delete("/series-activity/{series_id}/{activity_type}")
def delete_series_activity(series_id: int, activity_type: str, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM user_series_activity WHERE user_id = %s AND series_id = %s AND activity_type = %s",
        (user["user_id"], series_id, activity_type)
    )
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "deleted"}

# --- DİZİ YORUMLARI / LOG ---

@app.get("/reviews/{series_id}")
def get_reviews(series_id: int):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """SELECT r.*, u.username FROM user_series_reviews r
           LEFT JOIN users u ON u.user_id = r.user_id
           WHERE r.series_id = %s ORDER BY r.created_at DESC""",
        (series_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.post("/reviews")
def create_review(review: ReviewModel):
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO user_series_reviews (user_id, series_id, review_text, contains_spoiler)
           VALUES (1, %s, %s, %s) RETURNING review_id""",
        (review.series_id, review.review_text, review.contains_spoiler)
    )
    review_id = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "ok", "review_id": review_id}

# ============================================================
# --- AUTH: REGISTER / LOGIN / ME ---
# ============================================================

@app.post("/auth/register")
def register(data: RegisterModel):
    # --- Validasyon ---
    if len(data.username.strip()) < 3:
        raise HTTPException(status_code=400, detail="Kullanıcı adı en az 3 karakter olmalı.")
    if not re.match(r"^[A-Za-z0-9_]+$", data.username):
        raise HTTPException(status_code=400, detail="Kullanıcı adı sadece harf, rakam ve _ içerebilir.")
    if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", data.email):
        raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi girin.")
    if len(data.password) < 8:
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter olmalı.")

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Çakışma kontrolü
        cur.execute("SELECT user_id FROM users WHERE email = %s OR username = %s", (data.email.lower(), data.username))
        existing = cur.fetchone()
        if existing:
            cur.execute("SELECT user_id FROM users WHERE email = %s", (data.email.lower(),))
            if cur.fetchone():
                raise HTTPException(status_code=409, detail="Bu e-posta zaten kayıtlı.")
            raise HTTPException(status_code=409, detail="Bu kullanıcı adı zaten alınmış.")

        # Kullanıcı kaydet
        hashed = hash_password(data.password)
        cur.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s) RETURNING user_id, username, email, created_at",
            (data.username, data.email.lower(), hashed)
        )
        user = cur.fetchone()
        conn.commit()

        token = create_token(user["user_id"], user["username"])
        return {
            "token": token,
            "user": {"user_id": user["user_id"], "username": user["username"], "email": user["email"]}
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()

@app.post("/auth/login")
def login(data: LoginModel):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT * FROM users WHERE email = %s", (data.email.lower(),))
        user = cur.fetchone()
        if not user or not verify_password(data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı.")

        token = create_token(user["user_id"], user["username"])
        return {
            "token": token,
            "user": {"user_id": user["user_id"], "username": user["username"], "email": user["email"], "avatar": user.get("avatar")}
        }
    except HTTPException:
        raise
    finally:
        cur.close()
        conn.close()

@app.get("/auth/me")
def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT user_id, username, email, avatar, bio, created_at FROM users WHERE user_id = %s", (user["user_id"],))
    row = cur.fetchone()
    cur.close()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    return row

# ============================================================
# --- KULLANICI PROFİLİ ---
# ============================================================

@app.get("/profile/stats")
def get_profile_stats(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    user_id = user["user_id"]
    
    # 1. Toplam İzlenen Saat ve Gün
    cur.execute("""
        SELECT COALESCE(SUM(e.runtime), 0) as total_minutes, COUNT(ua.episode_id) as episodes_watched
        FROM user_activity ua
        JOIN episodes e ON ua.episode_id = e.episode_id
        WHERE ua.user_id = %s AND ua.activity_type = 'watched'
    """, (user_id,))
    time_stats = cur.fetchone()
    total_minutes = time_stats["total_minutes"] if time_stats["total_minutes"] else 0
    total_hours = total_minutes // 60
    total_days = total_hours // 24
    
    # 2. İzlenen Dizi Sayısı
    cur.execute("SELECT COUNT(DISTINCT series_id) as watched_series FROM user_activity WHERE user_id = %s AND activity_type = 'watched'", (user_id,))
    watched_series = cur.fetchone()["watched_series"]
    
    # 3. Watchlist Sayısı
    cur.execute("SELECT COUNT(*) as watchlist_count FROM user_series_activity WHERE user_id = %s AND activity_type = 'watchlist'", (user_id,))
    watchlist_count = cur.fetchone()["watchlist_count"]
    
    # 4. Favori Türler (Top 3)
    cur.execute("""
        SELECT s.genres 
        FROM user_activity ua 
        JOIN series s ON ua.series_id = s.series_id 
        WHERE ua.user_id = %s AND ua.activity_type = 'watched'
    """, (user_id,))
    genre_rows = cur.fetchall()
    genre_counts = {}
    for row in genre_rows:
        if row["genres"]:
            for g in row["genres"].split(","):
                g = g.strip()
                if g: genre_counts[g] = genre_counts.get(g, 0) + 1
    top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    top_genres_names = [g[0] for g in top_genres]
    
    # 5. Aylık İzleme İstatistiği (Son 6 ay grafik)
    cur.execute("""
        SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as count 
        FROM user_activity 
        WHERE user_id = %s AND activity_type = 'watched' 
        GROUP BY month 
        ORDER BY month DESC
        LIMIT 6
    """, (user_id,))
    monthly_stats = cur.fetchall()
    monthly_stats.reverse()
    
    cur.close()
    conn.close()
    
    return {
        "total_hours": total_hours,
        "total_days": total_days,
        "episodes_watched": time_stats["episodes_watched"],
        "watched_series": watched_series,
        "watchlist_count": watchlist_count,
        "top_genres": top_genres_names,
        "monthly_activity": monthly_stats
    }

@app.get("/profile/recent-activity")
def get_recent_activity(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT ua.activity_id, ua.activity_type, ua.created_at, 
               s.name as series_name, s.series_id, s.poster_path,
               e.season_id, e.episode_number, e.name as episode_name
        FROM user_activity ua
        JOIN series s ON ua.series_id = s.series_id
        JOIN episodes e ON ua.episode_id = e.episode_id
        WHERE ua.user_id = %s
        ORDER BY ua.created_at DESC
        LIMIT 15
    """, (user["user_id"],))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.get("/profile/favorites")
def get_favorite_series(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT s.series_id, s.name, s.poster_path, s.backdrop_path, s.rating 
        FROM user_series_activity usa
        JOIN series s ON usa.series_id = s.series_id
        WHERE usa.user_id = %s AND usa.activity_type = 'liked'
        ORDER BY usa.created_at DESC
        LIMIT 4
    """, (user["user_id"],))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

# ============================================================
# --- BÖLÜM PUANLAMA ---
# ============================================================

class EpisodeRatingModel(BaseModel):
    episode_id: int
    score: int

@app.get("/episode-ratings/{series_id}")
def get_episode_ratings(series_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    """Bir dizinin tüm bölümlerine kullanıcının verdiği puanları döndür."""
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT uer.episode_id, uer.score
        FROM user_episode_ratings uer
        JOIN episodes ep ON ep.episode_id = uer.episode_id
        JOIN seasons s ON s.season_id = ep.season_id
        WHERE uer.user_id = %s AND s.series_id = %s
        """,
        (user["user_id"], series_id)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return {row[0]: row[1] for row in rows}  # {episode_id: score}

@app.post("/episode-rating")
def set_episode_rating(data: EpisodeRatingModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO user_episode_ratings (user_id, episode_id, score)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id, episode_id) DO UPDATE SET score = EXCLUDED.score
            """,
            (user["user_id"], data.episode_id, data.score)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
    return {"status": "ok", "episode_id": data.episode_id, "score": data.score}

@app.delete("/episode-rating/{episode_id}")
def delete_episode_rating(episode_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM user_episode_ratings WHERE user_id = %s AND episode_id = %s", (user["user_id"], episode_id))
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "deleted"}


