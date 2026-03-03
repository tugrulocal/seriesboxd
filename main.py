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
import requests as http_requests

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
    # Kullanıcı aktiviteleri tablosu (bölüm bazlı izlendi/watchlist)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_activity (
            activity_id SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL,
            series_id   INTEGER NOT NULL,
            season_id   INTEGER,
            episode_id  INTEGER NOT NULL,
            activity_type VARCHAR(50) NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, episode_id, activity_type)
        );
    """)
    # Dizi bazlı aktiviteler (watched/liked/watchlist)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_series_activity (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL,
            series_id   INTEGER NOT NULL,
            activity_type VARCHAR(50) NOT NULL,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, series_id, activity_type)
        );
    """)
    # Kullanıcı puanları tablosu
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_ratings (
            rating_id   SERIAL PRIMARY KEY,
            user_id     INTEGER DEFAULT 1,
            series_id   INTEGER,
            score       INTEGER,
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, series_id)
        );
    """)
    # Mevcut tablolara created_at kolonu ekle (eksikse)
    for tbl in ['user_activity', 'user_series_activity', 'user_ratings']:
        try:
            cur.execute(f"ALTER TABLE {tbl} ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;")
        except Exception:
            conn.rollback()
    # Kullanıcının favori dizileri (profilde 5 slot)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_favorites (
            id        SERIAL PRIMARY KEY,
            user_id   INTEGER NOT NULL,
            series_id INTEGER NOT NULL,
            slot      INTEGER NOT NULL CHECK (slot BETWEEN 0 AND 4),
            UNIQUE(user_id, slot),
            UNIQUE(user_id, series_id)
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
def get_lists(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT * FROM user_lists WHERE user_id = %s ORDER BY list_id", (user["user_id"],))
    lists = cur.fetchall()
    cur.close()
    conn.close()
    return lists

@app.post("/lists")
def create_list(liste: ListeEkleModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("INSERT INTO user_lists (name, user_id) VALUES (%s, %s) RETURNING list_id, name", (liste.name, user["user_id"]))
    new_list = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return {"list_id": new_list[0], "name": new_list[1]}

@app.get("/lists/check/{series_id}")
def check_series_in_lists(series_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT li.list_id FROM list_items li JOIN user_lists ul ON li.list_id = ul.list_id WHERE li.series_id = %s AND ul.user_id = %s", (series_id, user["user_id"]))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return [row[0] for row in rows]

@app.post("/lists/{list_id}/items")
def add_item_to_list(list_id: int, item: ListeItemModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
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
def remove_item_from_list(list_id: int, series_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM list_items WHERE list_id = %s AND series_id = %s", (list_id, series_id))
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "removed"}

# --- AKTİVİTE (İZLENDİ / İZLEYECEĞİM) SİSTEMİ ---

@app.get("/activity/{series_id}")
def get_activity(series_id: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        "SELECT episode_id, season_id, activity_type FROM user_activity WHERE user_id = %s AND series_id = %s",
        (user["user_id"], series_id)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.post("/activity")
def set_activity(activity: ActivityModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute(
            """
            INSERT INTO user_activity (user_id, series_id, season_id, episode_id, activity_type)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id, episode_id, activity_type) DO NOTHING
            """,
            (user["user_id"], activity.series_id, activity.season_id, activity.episode_id, activity.activity_type)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        print(e)
    cur.close()
    conn.close()
    return {"status": "ok"}

@app.delete("/activity/{episode_id}/{activity_type}")
def delete_activity(episode_id: int, activity_type: str, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM user_activity WHERE user_id = %s AND episode_id = %s AND activity_type = %s",
        (user["user_id"], episode_id, activity_type)
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
def set_user_rating(rating: RatingModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO user_ratings (user_id, series_id, score) VALUES (%s, %s, %s)
            ON CONFLICT (user_id, series_id) DO UPDATE SET score = EXCLUDED.score
        """, (user["user_id"], rating.series_id, rating.score))
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
def create_review(review: ReviewModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO user_series_reviews (user_id, series_id, review_text, contains_spoiler)
           VALUES (%s, %s, %s, %s) RETURNING review_id""",
        (user["user_id"], review.series_id, review.review_text, review.contains_spoiler)
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
def get_recent_activity(limit: int = 15, days: Optional[int] = None, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    
    date_filter = ""
    if days:
        date_filter = f"AND created_at >= NOW() - INTERVAL '{days} days'"
        
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(f"""
        (
            SELECT ua.activity_id, ua.activity_type, ua.created_at, 
                   s.name as series_name, s.series_id, s.poster_path,
                   e.season_id, e.episode_number, e.name as episode_name,
                   NULL::int as score, NULL::varchar as review_text
            FROM user_activity ua
            JOIN series s ON ua.series_id = s.series_id
            JOIN episodes e ON ua.episode_id = e.episode_id
            WHERE ua.user_id = %(uid)s {date_filter}
        )
        UNION ALL
        (
            SELECT usa.id as activity_id, usa.activity_type, usa.created_at, 
                   s.name as series_name, s.series_id, s.poster_path,
                   NULL::int as season_id, NULL::int as episode_number, NULL::varchar as episode_name,
                   NULL::int as score, NULL::varchar as review_text
            FROM user_series_activity usa
            JOIN series s ON usa.series_id = s.series_id
            WHERE usa.user_id = %(uid)s {date_filter}
        )
        UNION ALL
        (
            SELECT ur.rating_id as activity_id, 'series_rated' as activity_type, ur.created_at,
                   s.name as series_name, s.series_id, s.poster_path,
                   NULL::int as season_id, NULL::int as episode_number, NULL::varchar as episode_name,
                   ur.score as score, NULL::varchar as review_text
            FROM user_ratings ur
            JOIN series s ON ur.series_id = s.series_id
            WHERE ur.user_id = %(uid)s {date_filter}
        )
        UNION ALL
        (
            SELECT uer.id as activity_id, 'episode_rated' as activity_type, uer.created_at,
                   s.name as series_name, se.series_id, s.poster_path,
                   e.season_id as season_id, e.episode_number as episode_number, e.name as episode_name,
                   uer.score as score, NULL::varchar as review_text
            FROM user_episode_ratings uer
            JOIN episodes e ON uer.episode_id = e.episode_id
            JOIN seasons se ON e.season_id = se.season_id
            JOIN series s ON se.series_id = s.series_id
            WHERE uer.user_id = %(uid)s {date_filter}
        )
        UNION ALL
        (
            SELECT usr.review_id as activity_id, 'series_reviewed' as activity_type, usr.created_at,
                   s.name as series_name, s.series_id, s.poster_path,
                   NULL::int as season_id, NULL::int as episode_number, NULL::varchar as episode_name,
                   NULL::int as score, usr.review_text as review_text
            FROM user_series_reviews usr
            JOIN series s ON usr.series_id = s.series_id
            WHERE usr.user_id = %(uid)s {date_filter}
        )
        ORDER BY created_at DESC
        LIMIT %(limit)s
    """, {"uid": user["user_id"], "limit": limit})
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
        SELECT uf.slot, s.series_id, s.name, s.poster_path, s.rating 
        FROM user_favorites uf
        JOIN series s ON uf.series_id = s.series_id
        WHERE uf.user_id = %s
        ORDER BY uf.slot
    """, (user["user_id"],))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

class FavoriteModel(BaseModel):
    series_id: int
    slot: int

@app.post("/profile/favorites")
def set_favorite(data: FavoriteModel, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    if data.slot < 0 or data.slot > 4:
        raise HTTPException(status_code=400, detail="Slot 0-4 arası olmalı.")
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM user_favorites WHERE user_id = %s AND slot = %s", (user["user_id"], data.slot))
        cur.execute("DELETE FROM user_favorites WHERE user_id = %s AND series_id = %s", (user["user_id"], data.series_id))
        cur.execute(
            "INSERT INTO user_favorites (user_id, series_id, slot) VALUES (%s, %s, %s)",
            (user["user_id"], data.series_id, data.slot)
        )
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
    return {"status": "ok"}

@app.delete("/profile/favorites/{slot}")
def remove_favorite(slot: int, credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("DELETE FROM user_favorites WHERE user_id = %s AND slot = %s", (user["user_id"], slot))
    conn.commit()
    cur.close()
    conn.close()
    return {"status": "deleted"}

@app.get("/profile/watchlist_preview")
def get_watchlist_preview(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
        
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT s.series_id, s.name, s.poster_path, s.rating 
        FROM user_series_activity usa
        JOIN series s ON usa.series_id = s.series_id
        WHERE usa.user_id = %s AND usa.activity_type = 'watchlist'
        ORDER BY usa.created_at DESC
        LIMIT 4
    """, (user["user_id"],))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.get("/profile/watched-series")
def get_watched_series(
    genre: Optional[str] = None,
    sort: Optional[str] = "recent",
    min_rating: Optional[float] = None,
    max_rating: Optional[float] = None,
    decade: Optional[str] = None,
    service: Optional[str] = None,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    conditions = ["usa.user_id = %s", "usa.activity_type = 'watched'"]
    params = [user["user_id"]]
    if genre and genre.strip():
        conditions.append("s.genres ILIKE %s")
        params.append(f"%{genre.strip()}%")
    if min_rating is not None:
        conditions.append("s.rating >= %s")
        params.append(min_rating)
    if max_rating is not None:
        conditions.append("s.rating <= %s")
        params.append(max_rating)
    if decade and decade.strip():
        try:
            decade_start = int(decade.strip().rstrip('s'))
            decade_end = decade_start + 9
            conditions.append("""
                EXISTS (
                    SELECT 1 FROM seasons se
                    WHERE se.series_id = s.series_id AND se.season_number = 1
                    AND EXTRACT(YEAR FROM se.air_date::date) BETWEEN %s AND %s
                )
            """)
            params.extend([decade_start, decade_end])
        except ValueError:
            pass
    if service and service.strip():
        conditions.append("s.networks ILIKE %s")
        params.append(f"%{service.strip()}%")
    where = " AND ".join(conditions)
    sort_map = {
        "recent": "usa.created_at DESC",
        "rating_desc": "s.rating DESC NULLS LAST",
        "rating_asc": "s.rating ASC NULLS LAST",
        "name_asc": "s.name ASC",
        "name_desc": "s.name DESC",
        "user_score_desc": "ur.score DESC NULLS LAST",
    }
    order = sort_map.get(sort, "usa.created_at DESC")
    cur.execute(f"""
        SELECT s.series_id, s.name, s.poster_path, s.rating, s.genres, s.networks,
               usa.created_at as watched_at,
               ur.score as user_score
        FROM user_series_activity usa
        JOIN series s ON usa.series_id = s.series_id
        LEFT JOIN user_ratings ur ON ur.series_id = s.series_id AND ur.user_id = usa.user_id
        WHERE {where}
        ORDER BY {order}
    """, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.get("/services")
def get_services():
    """Veritabanındaki tüm benzersiz yayın platformlarını döndür."""
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute("SELECT networks FROM series WHERE networks IS NOT NULL AND networks != ''")
    rows = cur.fetchall()
    cur.close()
    conn.close()
    service_set = set()
    for row in rows:
        for s in row[0].split(','):
            temiz = s.strip()
            if temiz:
                service_set.add(temiz)
    return sorted(list(service_set))

@app.get("/profile/user-reviews")
def get_user_reviews(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT r.review_id, r.review_text, r.contains_spoiler, r.created_at,
               s.series_id, s.name, s.poster_path, s.rating,
               ur.score as user_score
        FROM user_series_reviews r
        JOIN series s ON r.series_id = s.series_id
        LEFT JOIN user_ratings ur ON ur.series_id = s.series_id AND ur.user_id = r.user_id
        WHERE r.user_id = %s
        ORDER BY r.created_at DESC
    """, (user["user_id"],))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.get("/profile/liked-series")
def get_liked_series(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT s.series_id, s.name, s.poster_path, s.rating, s.genres,
               usa.created_at as liked_at,
               ur.score as user_score
        FROM user_series_activity usa
        JOIN series s ON usa.series_id = s.series_id
        LEFT JOIN user_ratings ur ON ur.series_id = s.series_id AND ur.user_id = usa.user_id
        WHERE usa.user_id = %s AND usa.activity_type = 'liked'
        ORDER BY usa.created_at DESC
    """, (user["user_id"],))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.get("/profile/lists-detail")
def get_lists_detail(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT ul.list_id, ul.name as list_name, ul.created_at,
               COUNT(li.series_id) as item_count
        FROM user_lists ul
        LEFT JOIN list_items li ON ul.list_id = li.list_id
        WHERE ul.user_id = %s
        GROUP BY ul.list_id, ul.name, ul.created_at
        ORDER BY ul.created_at DESC
    """, (user["user_id"],))
    lists = cur.fetchall()
    # Get preview posters for each list (max 5)
    for lst in lists:
        cur.execute("""
            SELECT s.series_id, s.name, s.poster_path
            FROM list_items li
            JOIN series s ON li.series_id = s.series_id
            WHERE li.list_id = %s
            LIMIT 5
        """, (lst["list_id"],))
        lst["items"] = cur.fetchall()
    cur.close()
    conn.close()
    return lists

@app.get("/profile/ratings-distribution")
def get_ratings_distribution(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = get_current_user(credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("""
        SELECT score, COUNT(*) as count
        FROM user_ratings
        WHERE user_id = %s AND score IS NOT NULL
        GROUP BY score
        ORDER BY score
    """, (user["user_id"],))
    rows = cur.fetchall()
    cur.close()
    conn.close()
    distribution = {i: 0 for i in range(1, 11)}
    total = 0
    for row in rows:
        distribution[row["score"]] = row["count"]
        total += row["count"]
    return {"distribution": distribution, "total": total}

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

# ============================================================
# --- NEREDE İZLENİR (TMDB Watch Providers) ---
# ============================================================

TMDB_API_KEY = "8ebd0cda4cf50b4a7f730c2164931769"

@app.get("/watch-providers/{series_id}")
def get_watch_providers(series_id: int):
    """TMDB API'den dizinin hangi platformlarda izlenebileceğini döndürür."""
    provider_urls = {
        "Netflix": "https://www.netflix.com",
        "Amazon Prime Video": "https://www.primevideo.com",
        "Disney Plus": "https://www.disneyplus.com",
        "HBO Max": "https://www.max.com",
        "Max": "https://www.max.com",
        "Hulu": "https://www.hulu.com",
        "Apple TV Plus": "https://tv.apple.com",
        "Apple TV": "https://tv.apple.com",
        "Paramount Plus": "https://www.paramountplus.com",
        "Paramount+": "https://www.paramountplus.com",
        "Peacock": "https://www.peacocktv.com",
        "Peacock Premium": "https://www.peacocktv.com",
        "Crunchyroll": "https://www.crunchyroll.com",
        "fuboTV": "https://www.fubo.tv",
        "Starz": "https://www.starz.com",
        "Showtime": "https://www.sho.com",
        "AMC Plus": "https://www.amcplus.com",
        "AMC+": "https://www.amcplus.com",
        "BluTV": "https://www.blutv.com",
        "MUBI": "https://mubi.com",
        "Curiosity Stream": "https://curiositystream.com",
        "Tubi TV": "https://tubitv.com",
        "Pluto TV": "https://pluto.tv",
        "Stan": "https://www.stan.com.au",
        "Now TV": "https://www.nowtv.com",
        "Sky Go": "https://www.sky.com",
        "Canal+": "https://www.canalplus.com",
        "Gain": "https://www.gain.tv",
        "TOD": "https://www.tod.tv",
        "beIN CONNECT": "https://www.beinconnect.com.tr",
        "Exxen": "https://www.exxen.com",
        "puhutv": "https://puhutv.com",
        "Tabii": "https://www.tabii.com",
    }
    try:
        url = f"https://api.themoviedb.org/3/tv/{series_id}/watch/providers?api_key={TMDB_API_KEY}"
        resp = http_requests.get(url, timeout=5)
        if resp.status_code != 200:
            return {"providers": []}
        data = resp.json()
        results = data.get("results", {})
        country_data = results.get("TR") or results.get("US")
        if not country_data:
            if results:
                country_data = next(iter(results.values()))
            else:
                return {"providers": []}
        providers = []
        seen = set()
        for ptype in ["flatrate", "free", "ads", "buy", "rent"]:
            for p in country_data.get(ptype, []):
                pid = p.get("provider_id")
                if pid not in seen:
                    seen.add(pid)
                    pname = p.get("provider_name", "")
                    providers.append({
                        "provider_id": pid,
                        "provider_name": pname,
                        "logo_path": p.get("logo_path"),
                        "url": provider_urls.get(pname, f"https://www.google.com/search?q={pname.replace(' ', '+')}+streaming")
                    })
        return {"providers": providers}
    except Exception as e:
        print(f"Watch providers hatası: {e}")
        return {"providers": []}


