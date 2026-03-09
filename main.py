from fastapi import FastAPI, HTTPException, Depends, Request, Response
import os
from dotenv import load_dotenv

load_dotenv()

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import psycopg2
from pydantic import BaseModel
from typing import Optional
from psycopg2.extras import RealDictCursor
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import re
import requests as http_requests
from bs4 import BeautifulSoup
import urllib.parse
import smtplib
import random
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# --- AUTH AYARLARI ---
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30
COOKIE_NAME = "sb_access_token"

# --- E-POSTA AYARLARI ---
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_EMAIL = os.getenv("SMTP_EMAIL", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
EMAIL_ENABLED = True

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_token(user_id: int, username: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "username": username, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    # 1) Önce Authorization header'dan dene
    if credentials and credentials.credentials:
        try:
            payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
            return {"user_id": int(payload["sub"]), "username": payload["username"]}
        except JWTError:
            pass
    # 2) HttpOnly cookie'den dene
    token = request.cookies.get(COOKIE_NAME)
    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return {"user_id": int(payload["sub"]), "username": payload["username"]}
        except JWTError:
            pass
    return None

def generate_code(length=6):
    return ''.join(random.choices(string.digits, k=length))

def send_verification_email(to_email: str, code: str, purpose: str = "verify"):
    if not EMAIL_ENABLED:
        print(f"[EMAIL DISABLED] {purpose} kodu {to_email} için: {code}")
        return True
    try:
        msg = MIMEMultipart()
        msg['From'] = SMTP_EMAIL
        msg['To'] = to_email
        if purpose == "verify":
            msg['Subject'] = "Seriesboxd - E-posta Doğrulama Kodu"
            body = f"""
            <html><body style="font-family:sans-serif;background:#0f172a;color:#f1f5f9;padding:30px;">
            <div style="max-width:400px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;text-align:center;">
                <h1 style="color:#38bdf8;margin:0 0 8px;">seriesboxd</h1>
                <p style="color:#94a3b8;font-size:14px;">E-posta adresini doğrula</p>
                <div style="background:#0f172a;border-radius:12px;padding:20px;margin:20px 0;">
                    <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#38bdf8;">{code}</span>
                </div>
                <p style="color:#64748b;font-size:13px;">Bu kod 10 dakika geçerlidir.</p>
            </div>
            </body></html>
            """
        else:
            msg['Subject'] = "Seriesboxd - Şifre Sıfırlama Kodu"
            body = f"""
            <html><body style="font-family:sans-serif;background:#0f172a;color:#f1f5f9;padding:30px;">
            <div style="max-width:400px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;text-align:center;">
                <h1 style="color:#38bdf8;margin:0 0 8px;">seriesboxd</h1>
                <p style="color:#94a3b8;font-size:14px;">Şifre sıfırlama kodun</p>
                <div style="background:#0f172a;border-radius:12px;padding:20px;margin:20px 0;">
                    <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#f59e0b;">{code}</span>
                </div>
                <p style="color:#64748b;font-size:13px;">Bu kod 10 dakika geçerlidir.</p>
            </div>
            </body></html>
            """
        msg.attach(MIMEText(body, 'html'))
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
        server.starttls()
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"E-posta gönderme hatası: {e}")
        return False

# 1. Uygulamayı sadece BİR kez oluşturuyoruz
app = FastAPI()

# Video Streaming IFrame ile yapıldığı için proxy'e gerek kalmadı
# 2. CORS ayarlarını hemen altına ekliyoruz (React ile konuşabilmesi için)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"],
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
    username: str
    password: str

class VerifyEmailModel(BaseModel):
    email: str
    code: str

class ForgotPasswordModel(BaseModel):
    email: str

class ResetPasswordModel(BaseModel):
    email: str
    code: str
    new_password: str

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
            is_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    # is_verified kolonu yoksa ekle (mevcut DB'ler için)
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT FALSE;")
    # E-posta doğrulama kodları tablosu
    cur.execute("""
        CREATE TABLE IF NOT EXISTS email_verification_codes (
            id        SERIAL PRIMARY KEY,
            email     VARCHAR(255) NOT NULL,
            code      VARCHAR(10) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            used      BOOLEAN DEFAULT FALSE
        );
    """)
    # Şifre sıfırlama kodları tablosu
    cur.execute("""
        CREATE TABLE IF NOT EXISTS password_reset_codes (
            id        SERIAL PRIMARY KEY,
            email     VARCHAR(255) NOT NULL,
            code      VARCHAR(10) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            used      BOOLEAN DEFAULT FALSE
        );
    """)
    # Episodes tablosuna vote_average kolonu ekle (yoksa)
    cur.execute("ALTER TABLE episodes ADD COLUMN IF NOT EXISTS vote_average NUMERIC(4,2) DEFAULT NULL;")
    # Mevcut kullanıcıları doğrulanmış olarak işaretle
    cur.execute("UPDATE users SET is_verified = TRUE WHERE is_verified = FALSE OR is_verified IS NULL;")
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
    # Bölüm yorumları tablosu
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_episode_reviews (
            review_id   SERIAL PRIMARY KEY,
            user_id     INTEGER,
            episode_id  INTEGER NOT NULL,
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
def get_lists(user = Depends(get_current_user)):
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
def create_list(liste: ListeEkleModel, user = Depends(get_current_user)):
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
def check_series_in_lists(series_id: int, user = Depends(get_current_user)):
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
def add_item_to_list(list_id: int, item: ListeItemModel, user = Depends(get_current_user)):
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
def remove_item_from_list(list_id: int, series_id: int, user = Depends(get_current_user)):
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
def get_activity(series_id: int, user = Depends(get_current_user)):
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
def set_activity(activity: ActivityModel, user = Depends(get_current_user)):
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
def delete_activity(episode_id: int, activity_type: str, user = Depends(get_current_user)):
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
def get_user_rating(series_id: int, user = Depends(get_current_user)):
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
def set_user_rating(rating: RatingModel, user = Depends(get_current_user)):
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
def delete_user_rating(series_id: int, user = Depends(get_current_user)):
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

class EpisodeReviewModel(BaseModel):
    episode_id: int
    review_text: str
    contains_spoiler: bool = False

@app.get("/series-activity/{series_id}")
def get_series_activity(series_id: int, user = Depends(get_current_user)):
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
def set_series_activity(item: SeriesActivityModel, user = Depends(get_current_user)):
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
def delete_series_activity(series_id: int, activity_type: str, user = Depends(get_current_user)):
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
def create_review(review: ReviewModel, user = Depends(get_current_user)):
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

@app.get("/episode-reviews/{episode_id}")
def get_episode_reviews(episode_id: int):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """SELECT r.*, u.username FROM user_episode_reviews r
           LEFT JOIN users u ON u.user_id = r.user_id
           WHERE r.episode_id = %s ORDER BY r.created_at DESC""",
        (episode_id,)
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows

@app.post("/episode-reviews")
def create_episode_review(review: EpisodeReviewModel, user = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Giriş yapmalısınız.")
    conn = get_db_conn()
    cur = conn.cursor()
    cur.execute(
        """INSERT INTO user_episode_reviews (user_id, episode_id, review_text, contains_spoiler)
           VALUES (%s, %s, %s, %s) RETURNING review_id""",
        (user["user_id"], review.episode_id, review.review_text, review.contains_spoiler)
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

        # Kullanıcı kaydet (henüz doğrulanmamış)
        hashed = hash_password(data.password)
        cur.execute(
            "INSERT INTO users (username, email, password_hash, is_verified) VALUES (%s, %s, %s, %s) RETURNING user_id, username, email",
            (data.username, data.email.lower(), hashed, not EMAIL_ENABLED)
        )
        user = cur.fetchone()

        # Doğrulama kodu gönder
        if EMAIL_ENABLED:
            code = generate_code()
            cur.execute("INSERT INTO email_verification_codes (email, code) VALUES (%s, %s)", (data.email.lower(), code))
            send_verification_email(data.email.lower(), code, "verify")
            conn.commit()
            return {
                "status": "verification_required",
                "message": "E-posta adresine doğrulama kodu gönderildi.",
                "email": data.email.lower()
            }
        else:
            # E-posta doğrulama kapalı → direkt giriş yap
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

@app.post("/auth/verify-email")
def verify_email(data: VerifyEmailModel, response: Response):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Son 10 dakika içindeki kullanılmamış kodu kontrol et
        cur.execute("""
            SELECT id FROM email_verification_codes 
            WHERE email = %s AND code = %s AND used = FALSE 
            AND created_at > NOW() - INTERVAL '10 minutes'
            ORDER BY created_at DESC LIMIT 1
        """, (data.email.lower(), data.code))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş kod.")

        # Kodu kullanılmış olarak işaretle
        cur.execute("UPDATE email_verification_codes SET used = TRUE WHERE id = %s", (row["id"],))
        # Kullanıcıyı doğrulanmış yap
        cur.execute("UPDATE users SET is_verified = TRUE WHERE email = %s RETURNING user_id, username, email", (data.email.lower(),))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
        conn.commit()

        token = create_token(user["user_id"], user["username"])
        response.set_cookie(
            key=COOKIE_NAME, value=token,
            httponly=True, samesite="lax", secure=False,
            max_age=ACCESS_TOKEN_EXPIRE_DAYS * 86400
        )
        return {
            "token": token,
            "user": {"user_id": user["user_id"], "username": user["username"], "email": user["email"]}
        }
    except HTTPException:
        raise
    finally:
        cur.close()
        conn.close()

@app.post("/auth/resend-code")
def resend_code(data: ForgotPasswordModel):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT user_id FROM users WHERE email = %s", (data.email.lower(),))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Bu e-posta ile kayıtlı hesap bulunamadı.")
        code = generate_code()
        cur.execute("INSERT INTO email_verification_codes (email, code) VALUES (%s, %s)", (data.email.lower(), code))
        conn.commit()
        send_verification_email(data.email.lower(), code, "verify")
        return {"status": "ok", "message": "Doğrulama kodu tekrar gönderildi."}
    finally:
        cur.close()
        conn.close()

@app.post("/auth/login")
def login(data: LoginModel, response: Response):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Kullanıcı adı ile ara
        cur.execute("SELECT * FROM users WHERE username = %s", (data.username,))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı.")
        if not verify_password(data.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Şifre hatalı.")
        if EMAIL_ENABLED and not user.get("is_verified", False):
            raise HTTPException(status_code=403, detail="E-posta adresiniz henüz doğrulanmamış. Lütfen e-postanızı kontrol edin.")

        token = create_token(user["user_id"], user["username"])
        response.set_cookie(
            key=COOKIE_NAME, value=token,
            httponly=True, samesite="lax", secure=False,
            max_age=ACCESS_TOKEN_EXPIRE_DAYS * 86400
        )
        return {
            "token": token,
            "user": {"user_id": user["user_id"], "username": user["username"], "email": user["email"], "avatar": user.get("avatar")}
        }
    except HTTPException:
        raise
    finally:
        cur.close()
        conn.close()

class GoogleAuthModel(BaseModel):
    token: str

@app.post("/auth/google")
def google_auth(data: GoogleAuthModel, response: Response):
    # Verify the Google access_token sent from frontend useGoogleLogin hook
    try:
        # Use httpx to verify token with Google's userinfo endpoint
        verify_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        headers = {"Authorization": f"Bearer {data.token}"}
        google_res = http_requests.get(verify_url, headers=headers)
        
        if google_res.status_code != 200:
            raise HTTPException(status_code=400, detail="Geçersiz Google token'ı. " + str(google_res.text))
            
        token_info = google_res.json()
        email = token_info.get("email")
        picture = token_info.get("picture")
        
        if not email:
            raise HTTPException(status_code=400, detail="Google hesabınızdan e-posta alınamadı.")
            
        conn = get_db_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if user exists
        cur.execute("SELECT * FROM users WHERE email = %s", (email.lower(),))
        user = cur.fetchone()
        
        if not user:
            # Create new user
            username = email.split('@')[0]
            # Ensure unique username
            base_username = username
            counter = 1
            while True:
                cur.execute("SELECT user_id FROM users WHERE username = %s", (username,))
                if not cur.fetchone():
                    break
                username = f"{base_username}{counter}"
                counter += 1
                
            # Random secure password for Google users since they don't use it
            random_pwd = ''.join(random.choices(string.ascii_letters + string.digits, k=16))
            hashed = hash_password(random_pwd)
            
            cur.execute(
                "INSERT INTO users (username, email, password_hash, is_verified, avatar) VALUES (%s, %s, %s, %s, %s) RETURNING user_id, username, email, avatar",
                (username, email.lower(), hashed, True, picture)
            )
            user = cur.fetchone()
            conn.commit()
            
        token = create_token(user["user_id"], user["username"])
        response.set_cookie(
            key=COOKIE_NAME, value=token,
            httponly=True, samesite="lax", secure=False,
            max_age=ACCESS_TOKEN_EXPIRE_DAYS * 86400
        )
        
        return {
            "token": token,
            "user": {"user_id": user["user_id"], "username": user["username"], "email": user["email"], "avatar": user.get("avatar")}
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Google auth hatası: {e}")
        raise HTTPException(status_code=500, detail="Google ile giriş yapılamadı.")
    finally:
        if 'cur' in locals():
            cur.close()
        if 'conn' in locals():
            conn.close()

@app.get("/auth/me")
def get_me(user = Depends(get_current_user)):
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

@app.post("/auth/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"status": "ok"}

@app.post("/auth/forgot-password")
def forgot_password(data: ForgotPasswordModel):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT user_id, email FROM users WHERE email = %s", (data.email.lower(),))
        user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=404, detail="Bu e-posta ile kayıtlı hesap bulunamadı.")
        code = generate_code()
        cur.execute("INSERT INTO password_reset_codes (email, code) VALUES (%s, %s)", (data.email.lower(), code))
        conn.commit()
        send_verification_email(data.email.lower(), code, "reset")
        return {"status": "ok", "message": "Şifre sıfırlama kodu e-posta adresine gönderildi."}
    except HTTPException:
        raise
    finally:
        cur.close()
        conn.close()

@app.post("/auth/reset-password")
def reset_password(data: ResetPasswordModel):
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="Yeni şifre en az 8 karakter olmalı.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT id FROM password_reset_codes 
            WHERE email = %s AND code = %s AND used = FALSE 
            AND created_at > NOW() - INTERVAL '10 minutes'
            ORDER BY created_at DESC LIMIT 1
        """, (data.email.lower(), data.code))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş kod.")
        
        cur.execute("UPDATE password_reset_codes SET used = TRUE WHERE id = %s", (row["id"],))
        hashed = hash_password(data.new_password)
        cur.execute("UPDATE users SET password_hash = %s WHERE email = %s", (hashed, data.email.lower()))
        conn.commit()
        return {"status": "ok", "message": "Şifreniz başarıyla güncellendi."}
    except HTTPException:
        raise
    finally:
        cur.close()
        conn.close()

# ============================================================
# --- KULLANICI PROFİLİ ---
# ============================================================

@app.get("/profile/stats")
def get_profile_stats(user = Depends(get_current_user)):
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
def get_recent_activity(limit: int = 15, days: Optional[int] = None, user = Depends(get_current_user)):
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
def get_favorite_series(user = Depends(get_current_user)):
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
def set_favorite(data: FavoriteModel, user = Depends(get_current_user)):
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
def remove_favorite(slot: int, user = Depends(get_current_user)):
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
def get_watchlist_preview(user = Depends(get_current_user)):
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
    user = Depends(get_current_user)
):
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
def get_user_reviews(user = Depends(get_current_user)):
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
def get_liked_series(user = Depends(get_current_user)):
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
def get_lists_detail(user = Depends(get_current_user)):
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
def get_ratings_distribution(user = Depends(get_current_user)):
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
def get_episode_ratings(series_id: int, user = Depends(get_current_user)):
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
def set_episode_rating(data: EpisodeRatingModel, user = Depends(get_current_user)):
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
def delete_episode_rating(episode_id: int, user = Depends(get_current_user)):
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

TMDB_API_KEY = os.getenv("TMDB_API_KEY")
OPENSUBTITLES_API_KEY = os.getenv("OPENSUBTITLES_API_KEY")

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

# ============================================================
# --- OTONOM TORRENT ARAMA MOTORU ---
# ============================================================

import re

TMDB_API_KEY = os.getenv("TMDB_API_KEY")   

def get_torrentio_links(imdb_id: str, season: int, episode: int):
    """
    Torrentio eklentisinden (Stremio) yüksek kaliteli seed kaynağına sahip bağlantıları çeker.
    """
    magnets = []
    try:
        url = f"https://torrentio.strem.fun/stream/series/{imdb_id}:{season}:{episode}.json"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = http_requests.get(url, headers=headers, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            for s in data.get("streams", []):
                title = s.get("title", "")
                name = s.get("name", "Torrentio")
                info_hash = s.get("infoHash")
                
                if not info_hash:
                    continue
                
                # Torrentio title örneği: "Game of Thrones S01... \n👤 826 💾 841.06 MB ⚙️ 1337x"
                # Seeders ayıklama:
                parts = title.replace("\n", " ").split()
                seeders = 0
                for i, word in enumerate(parts):
                    if '👤' in word or '\ud83d\udc64' in word:
                        if i + 1 < len(parts) and parts[i+1].isdigit():
                            seeders = int(parts[i+1])
                            
                # Kaynak ismi: genelde cark (⚙️) işaretinden sonra gelir. Veya genel "Torrentio" diyelim
                source = "Torrentio"
                for i, word in enumerate(parts):
                    if '⚙️' in word or '\u2699\ufe0f' in word:
                        if i + 1 < len(parts):
                            source = parts[i+1]

                display_name = title.split("\n")[0] if "\n" in title else name
                
                trackers = [
                    "http://tracker.opentrackr.org:1337/announce",
                    "udp://tracker.opentrackr.org:1337/announce",
                    "udp://tracker.openbittorrent.com:6969/announce",
                    "udp://exodus.desync.com:6969/announce",
                    "udp://tracker.torrent.eu.org:451/announce"
                ]
                tr_strings = "".join([f"&tr={urllib.parse.quote_plus(tr)}" for tr in trackers])
                
                # Check for fileIdx to support season packs properly
                file_idx = s.get("fileIdx")
                file_ext = f"&fileIdx={file_idx}" if file_idx is not None else ""
                
                magnet_link = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote_plus(display_name)}{tr_strings}{file_ext}"
                
                magnets.append({
                    "name": display_name[:100],  # Çok uzun isimleri kes
                    "magnet": magnet_link,
                    "source": source,
                    "seeders": seeders
                })
    except Exception as e:
        print(f"Torrentio Hatası: {e}")
        
    return magnets

def get_magnet_links(query: str):
    """
    Popüler torrent indekslerinde arama yaparak en çok seeder'a sahip magnet linkleri döndürür.
    """
    magnets = []
    
    # 1. APIBay (The Pirate Bay) - Çok Hızlı ve JSON döndürür
    try:
        url = f"https://apibay.org/q.php?q={urllib.parse.quote_plus(query)}"
        resp = http_requests.get(url, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            # En fazla 10 sonuç alalım
            for item in data[:10]:
                if item.get("info_hash") and item["info_hash"] != "0000000000000000000000000000000000000000":
                    name = item.get("name", "Bilinmeyen Başlık")
                    info_hash = item["info_hash"]
                    seeders = int(item.get("seeders", 0))
                    magnet = f"magnet:?xt=urn:btih:{info_hash}&dn={urllib.parse.quote_plus(name)}"
                    magnets.append({"name": name, "magnet": magnet, "source": "ThePirateBay", "seeders": seeders})
    except Exception as e:
        print(f"APIBay Hatası: {e}")

    # 2. Kaynak: 1337x Proxy scraping (BeautifulSoup4 kullanarak)
    try:
        url = f"https://1337x.to/search/{urllib.parse.quote_plus(query)}/1/"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = http_requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            rows = soup.select("tbody tr")
            for row in rows[:5]: # İlk 5 sonucu alalım
                name_elem = row.select_one(".name a:nth-of-type(2)")
                if not name_elem:
                    continue
                seeders_elem = row.select_one(".seeds")
                seeders = int(seeders_elem.text.strip()) if seeders_elem and seeders_elem.text.strip().isdigit() else 0
                
                detail_url = "https://1337x.to" + name_elem['href']
                detail_resp = http_requests.get(detail_url, headers=headers, timeout=5)
                if detail_resp.status_code == 200:
                    detail_soup = BeautifulSoup(detail_resp.text, 'html.parser')
                    magnet_link = detail_soup.select_one('a[href^="magnet:"]')
                    if magnet_link:
                        magnets.append({"name": name_elem.text.strip(), "magnet": magnet_link['href'], "source": "1337x", "seeders": seeders})
    except Exception as e:
        print(f"1337x Hatası: {e}")
            
    # 3. Kaynak: bitsearch.to scraping
    try:
        url = f"https://bitsearch.to/search?q={urllib.parse.quote_plus(query)}"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        resp = http_requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, 'html.parser')
            items = soup.select('li.search-result')
            for item in items[:5]:
                title_elem = item.select_one('h5.title a')
                magnet_elem = item.select_one('a.dl-magnet')
                stats = item.select('div.stats div')
                seeders = 0
                for stat in stats:
                    if 'Seeder' in stat.get('title', '') or stat.select_one('img[alt="Seeder"]'):
                        s_text = stat.text.strip()
                        if s_text.isdigit(): 
                            seeders = int(s_text)
                if title_elem and magnet_elem:
                    magnets.append({"name": title_elem.text.strip(), "magnet": magnet_elem['href'], "source": "BitSearch", "seeders": seeders})
    except Exception as e:
        print(f"BitSearch Hatası: {e}")

    # Sonuçları seed sayısına göre büyükten küçüğe sırala ve ilk 15 listesini döndür.
    magnets.sort(key=lambda x: x.get("seeders", 0), reverse=True)
    return magnets[:15]

@app.get("/api/stream/{series_id}/{season}/{episode}")
def stream_endpoint(series_id: int, season: int, episode: int):
    """
    Veritabanından dizi ismini alıp torrent araması yapar ve magnet linklerini döner.
    """
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT name FROM series WHERE series_id = %s", (series_id,))
        dizi = cur.fetchone()
    finally:
        cur.close()
        conn.close()
    
    if not dizi:
        raise HTTPException(status_code=404, detail="Dizi bulunamadı")
        
    series_name = dizi["name"]
    query = f"{series_name} s{season:02d}e{episode:02d}"
    
    # IMDB ID'yi TMDB üzerinden al (Torrentio için gerekli)
    imdb_id = None
    try:
        tmdb_url = f"https://api.themoviedb.org/3/tv/{series_id}/external_ids?api_key={TMDB_API_KEY}"
        tmdb_resp = http_requests.get(tmdb_url, timeout=5)
        if tmdb_resp.status_code == 200:
            ext_data = tmdb_resp.json()
            imdb_id = ext_data.get("imdb_id")
    except Exception as e:
        print(f"IMDB ID çekme hatası: {e}")

    # Torrent altyapısı devre dışı bırakıldı (Plan B - IFrame Embeds)
    embeds = []
    
    # PRIMARY PLAYER: VidPlus.pro (2Embed VPLS backend - temiz player, reklamsız)
    embeds.append({
        "name": "SeriesBoxd Player",
        "source": "player.vidplus.pro",
        "url": f"https://player.vidplus.pro/embed/tv/{series_id}/{season}/{episode}?server=boba",
        "type": "primary",
        "badge": "HD"
    })
    
    # ALT 1: SuperEmbed -- 1080p, çok sunucu
    if imdb_id:
        embeds.append({
            "name": "SuperEmbed",
            "source": "multiembed.mov",
            "url": f"https://multiembed.mov/?video_id={imdb_id}&s={season}&e={episode}",
            "type": "alternative",
            "badge": "1080p"
        })

    # ALT 2: 2Embed VPLS -- Boba/Wink yüksek kalite kaynaklar
    embeds.append({
        "name": "2Embed VPLS",
        "source": "streamsrcs.2embed.cc",
        "url": f"https://streamsrcs.2embed.cc/vpls-tv?tmdb={series_id}&s={season}&e={episode}",
        "type": "alternative",
        "badge": "1080p"
    })
    
    # ALT 3: VidSrc (vidsrc.me) -- Yedek, 720p ama stabil
    embeds.append({
        "name": "VidSrc",
        "source": "vidsrc.me",
        "url": f"https://vidsrc.me/embed/tv?tmdb={series_id}&season={season}&episode={episode}",
        "type": "alternative",
        "badge": "720p"
    })
    
    # ALT 4: HNEmbed -- Alternatif embed
    if imdb_id:
        embeds.append({
            "name": "HNEmbed",
            "source": "hnembed.cc",
            "url": f"https://hnembed.cc/embed/tv/{imdb_id}/{season}/{episode}",
            "type": "alternative",
            "badge": "HD"
        })
    
    return {
        "query": query,
        "imdb_id": imdb_id,
        "results": embeds
    }

@app.get("/api/stream/resolve/{series_id}/{season}/{episode}", tags=["streaming"])
def resolve_stream_endpoint(series_id: int, season: int, episode: int):
    """
    Returns embed sources instantly. Subtitles are fetched separately by the frontend.
    """
    return stream_endpoint(series_id, season, episode)

@app.get("/api/subtitles/search/{imdb_id}/{season}/{episode}", tags=["subtitles"])
def search_subtitles(imdb_id: str, season: int, episode: int):
    """
    Searches Stremio OpenSubtitles v3 Addon for TR and EN subtitles.
    Returns ALL candidates per language with proxied download URLs.
    No strict quota limits, and URLs are fetched in one step.
    """
    try:
        url = f"https://opensubtitles-v3.strem.io/subtitles/series/{imdb_id}:{season}:{episode}.json"
        headers = {
            "User-Agent": "Mozilla/5.0"
        }
        resp = http_requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        
        subtitles = []
        tur_subs = []
        eng_subs = []
        
        for item in data.get("subtitles", []):
            lang = item.get("lang")
            dl_link = item.get("url")
            
            if not dl_link:
                continue
                
            if lang == "tur" and len(tur_subs) < 20:
                tur_subs.append(item)
            elif lang == "eng" and len(eng_subs) < 20:
                eng_subs.append(item)
                
            if len(tur_subs) >= 20 and len(eng_subs) >= 20:
                break
                
        filtered_subs = tur_subs + eng_subs

        for i, item in enumerate(filtered_subs):
            lang_code = item.get("lang")
            sub_lang = "tr" if lang_code == "tur" else "en"
            download_link = item.get("url")
            proxy_url = f"http://127.0.0.1:8000/api/subtitles/proxy?url={urllib.parse.quote(download_link, safe='')}"
            
            subtitles.append({
                "lang": sub_lang,
                "label": "Türkçe" if sub_lang == "tr" else "English",
                "file_id": item.get("id", str(i)),
                "release": f"Altyazı {len(subtitles) + 1} ({item.get('SubEncoding', 'UTF-8')})",
                "download_count": 0,
                "url": proxy_url,
                "default": sub_lang == "tr"
            })
        
        return {"subtitles": subtitles}
    except Exception as e:
        print(f"Stremio Subtitles search error: {e}")
        return {"subtitles": []}


import re
import chardet
from fastapi import Response

def srt_to_vtt(srt_content: str) -> str:
    """Converts basic SRT content to WebVTT format."""
    # Replace comma with dot in timestamps
    vtt = re.sub(r'(\d{2}:\d{2}:\d{2}),(\d{3})', r'\1.\2', srt_content)
    # Ensure it starts with WEBVTT
    if not vtt.strip().startswith("WEBVTT"):
        vtt = "WEBVTT\n\n" + vtt.strip()
    return vtt

@app.get("/api/subtitles/proxy", tags=["subtitles"])
async def proxy_subtitle(url: str):
    """
    Fetches a subtitle file from a URL, decodes it properly (handling Turkish encodings),
    and strictly returns UTF-8 formatted VTT content.
    Uses chardet for reliable encoding detection.
    """
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        resp = http_requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        
        raw_content = resp.content
        text_content = ""
        
        # Use chardet to detect encoding with confidence threshold
        detected = chardet.detect(raw_content)
        detected_enc = detected.get('encoding', 'utf-8')
        confidence = detected.get('confidence', 0)
        
        if detected_enc and confidence > 0.6:
            try:
                text_content = raw_content.decode(detected_enc)
            except (UnicodeDecodeError, LookupError):
                detected_enc = None
        
        # Fallback chain optimized for Turkish subtitles
        if not text_content:
            for enc in ['cp1254', 'iso-8859-9', 'utf-8', 'latin-1']:
                try:
                    text_content = raw_content.decode(enc)
                    break
                except (UnicodeDecodeError, LookupError):
                    continue
                    
        if not text_content:
            text_content = raw_content.decode('utf-8', errors='replace')
            
        # If it's SRT, convert to VTT for HTML5 video player compatibility
        if "-->" in text_content and "," in text_content.split("-->")[0]:
            text_content = srt_to_vtt(text_content)
        
        # Ensure WEBVTT header
        if not text_content.strip().startswith("WEBVTT"):
            text_content = "WEBVTT\n\n" + text_content.strip()
            
        # Return strict UTF-8 bytes with correct content type
        return Response(
            content=text_content.encode('utf-8'),
            media_type="text/vtt; charset=utf-8",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600"
            }
        )
        
    except Exception as e:
        print(f"Subtitle proxy error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
