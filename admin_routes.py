import os
import time
from typing import Optional

import psycopg2
import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from pydantic import BaseModel
from psycopg2.extras import RealDictCursor

router = APIRouter(prefix="/admin", tags=["admin"])

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = "HS256"
ADMIN_EMAIL = "seriesboxd@gmail.com"
TMDB_API_KEY = os.getenv("TMDB_API_KEY")
TMDB_BASE = "https://api.themoviedb.org/3"
COOKIE_NAME = "sb_access_token"
security = HTTPBearer(auto_error=False)


def get_db_conn():
    db_url = os.getenv("DATABASE_URL") or os.getenv("REMOTE_DATABASE_URL")
    if db_url:
        if "sslmode" not in db_url:
            db_url += ("&" if "?" in db_url else "?") + "sslmode=require"
        return psycopg2.connect(db_url)
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME", "seriesboxd"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "1234"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
    )


def admin_required(request: Request, credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    else:
        token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token.")

    email = payload.get("email", "")

    # Fallback: token'da email yoksa (eski token / Google auth) DB'den çek
    if not email:
        user_id = int(payload.get("sub", 0))
        conn = get_db_conn()
        cur = conn.cursor()
        try:
            cur.execute("SELECT email FROM users WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if row:
                email = row[0] or ""
        finally:
            cur.close()
            conn.close()

    if email.lower() != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return {"user_id": int(payload["sub"]), "username": payload["username"], "email": email}


# --------------- Pydantic Models ---------------

class SeriesCreateModel(BaseModel):
    series_id: int
    name: str
    rating: Optional[float] = None
    overview: Optional[str] = None
    poster_path: Optional[str] = None
    status: Optional[str] = None
    networks: Optional[str] = None
    created_by: Optional[str] = None
    genres: Optional[str] = None
    backdrop_path: Optional[str] = None
    vote_count: Optional[int] = None
    imdb_id: Optional[str] = None
    origin_country: Optional[str] = None
    original_language: Optional[str] = None
    first_air_date: Optional[str] = None


class SeriesUpdateModel(BaseModel):
    name: Optional[str] = None
    rating: Optional[float] = None
    overview: Optional[str] = None
    poster_path: Optional[str] = None
    status: Optional[str] = None
    networks: Optional[str] = None
    created_by: Optional[str] = None
    genres: Optional[str] = None
    backdrop_path: Optional[str] = None
    vote_count: Optional[int] = None
    imdb_id: Optional[str] = None
    origin_country: Optional[str] = None
    original_language: Optional[str] = None
    first_air_date: Optional[str] = None


# --------------- Dashboard ---------------

@router.get("/stats")
def admin_stats(user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("SELECT COUNT(*) FROM series")
        series_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM users")
        users_count = cur.fetchone()[0]
        return {"series_count": series_count, "users_count": users_count}
    finally:
        cur.close()
        conn.close()


@router.get("/users")
def admin_list_users(q: Optional[str] = None, page: int = 1, per_page: int = 50, user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        if q and q.strip():
            like = f"%{q.strip().lower()}%"
            cur.execute("SELECT COUNT(*) FROM users WHERE LOWER(username) LIKE %s OR LOWER(email) LIKE %s", (like, like))
            total = cur.fetchone()["count"]
            cur.execute(
                "SELECT user_id, username, email, created_at, is_verified, avatar FROM users WHERE LOWER(username) LIKE %s OR LOWER(email) LIKE %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
                (like, like, per_page, offset)
            )
        else:
            cur.execute("SELECT COUNT(*) FROM users")
            total = cur.fetchone()["count"]
            cur.execute(
                "SELECT user_id, username, email, created_at, is_verified, avatar FROM users ORDER BY created_at DESC LIMIT %s OFFSET %s",
                (per_page, offset)
            )
        users = cur.fetchall()
        return {"users": users, "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


# --------------- Series CRUD ---------------

@router.get("/series")
def admin_list_series(
    q: Optional[str] = None,
    page: int = 1,
    per_page: int = 20,
    sort_by: str = "name",
    sort_order: str = "asc",
    status_filter: Optional[str] = None,
    genre_filter: Optional[str] = None,
    user=Depends(admin_required)
):
    ALLOWED_SORT = {"name", "rating", "first_air_date", "vote_count"}
    safe_sort = sort_by if sort_by in ALLOWED_SORT else "name"
    safe_order = "DESC" if sort_order.lower() == "desc" else "ASC"

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        offset = (page - 1) * per_page
        conditions = []
        params = []

        if q and q.strip():
            conditions.append("LOWER(name) LIKE %s")
            params.append(f"%{q.strip().lower()}%")
        if status_filter and status_filter.strip():
            conditions.append("LOWER(status) LIKE %s")
            params.append(f"%{status_filter.strip().lower()}%")
        if genre_filter and genre_filter.strip():
            conditions.append("LOWER(genres) LIKE %s")
            params.append(f"%{genre_filter.strip().lower()}%")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        cur.execute(f"SELECT COUNT(*) FROM series {where}", params)
        total = cur.fetchone()["count"]
        cur.execute(
            f"SELECT * FROM series {where} ORDER BY {safe_sort} {safe_order} NULLS LAST LIMIT %s OFFSET %s",
            params + [per_page, offset]
        )
        series = cur.fetchall()
        return {"series": series, "total": total, "page": page, "per_page": per_page}
    finally:
        cur.close()
        conn.close()


@router.post("/series")
def admin_create_series(data: SeriesCreateModel, user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("SELECT series_id FROM series WHERE series_id = %s", (data.series_id,))
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="Bu series_id zaten mevcut.")
        cur.execute("""
            INSERT INTO series (series_id, name, rating, overview, poster_path, status, networks,
                                created_by, genres, backdrop_path, vote_count, imdb_id,
                                origin_country, original_language, first_air_date)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.series_id, data.name, data.rating, data.overview, data.poster_path,
              data.status, data.networks, data.created_by, data.genres, data.backdrop_path,
              data.vote_count, data.imdb_id, data.origin_country, data.original_language,
              data.first_air_date))
        row = cur.fetchone()
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.put("/series/{series_id}")
def admin_update_series(series_id: int, data: SeriesUpdateModel, user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        updates = {k: v for k, v in data.model_dump().items() if v is not None}
        if not updates:
            raise HTTPException(status_code=400, detail="En az bir alan belirtmelisiniz.")
        set_clause = ", ".join(f"{k} = %s" for k in updates.keys())
        values = list(updates.values()) + [series_id]
        cur.execute(f"UPDATE series SET {set_clause} WHERE series_id = %s RETURNING *", values)
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Dizi bulunamadi.")
        conn.commit()
        return row
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.delete("/series/{series_id}")
def admin_delete_series(series_id: int, user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM series_cast WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM series_crew WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM episodes WHERE season_id IN (SELECT season_id FROM seasons WHERE series_id = %s)", (series_id,))
        cur.execute("DELETE FROM seasons WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM user_series_activity WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM user_ratings WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM user_series_reviews WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM user_activity WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM user_favorites WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM list_items WHERE series_id = %s", (series_id,))
        cur.execute("DELETE FROM series WHERE series_id = %s", (series_id,))
        conn.commit()
        return {"status": "ok", "deleted_series_id": series_id}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# --------------- TMDB Integration ---------------

@router.get("/tmdb/search")
def admin_tmdb_search(q: str, user=Depends(admin_required)):
    if not TMDB_API_KEY:
        raise HTTPException(status_code=500, detail="TMDB_API_KEY is not configured.")
    url = f"{TMDB_BASE}/search/tv?api_key={TMDB_API_KEY}&query={q}&language=tr-TR"
    resp = http_requests.get(url, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="TMDB API error.")
    data = resp.json()
    results = []
    for item in data.get("results", [])[:10]:
        results.append({
            "id": item["id"],
            "name": item.get("name"),
            "poster_path": item.get("poster_path"),
            "first_air_date": item.get("first_air_date"),
            "overview": (item.get("overview") or "")[:200],
            "vote_average": item.get("vote_average"),
        })
    return {"results": results}


@router.get("/tmdb/fetch/{tmdb_id}")
def admin_tmdb_fetch(tmdb_id: int, user=Depends(admin_required)):
    if not TMDB_API_KEY:
        raise HTTPException(status_code=500, detail="TMDB_API_KEY is not configured.")
    url = f"{TMDB_BASE}/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=tr-TR"
    resp = http_requests.get(url, timeout=10)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="TMDB API error or series not found.")
    d = resp.json()

    ext_url = f"{TMDB_BASE}/tv/{tmdb_id}/external_ids?api_key={TMDB_API_KEY}"
    ext_resp = http_requests.get(ext_url, timeout=5)
    imdb_id = ext_resp.json().get("imdb_id") if ext_resp.status_code == 200 else None

    return {
        "series_id": d["id"],
        "name": d.get("name"),
        "rating": d.get("vote_average"),
        "overview": d.get("overview"),
        "poster_path": d.get("poster_path"),
        "backdrop_path": d.get("backdrop_path"),
        "status": d.get("status"),
        "networks": ", ".join([n["name"] for n in d.get("networks", [])]),
        "created_by": ", ".join([c["name"] for c in d.get("created_by", [])]),
        "genres": ", ".join([g["name"] for g in d.get("genres", [])]),
        "vote_count": d.get("vote_count", 0),
        "imdb_id": imdb_id,
        "origin_country": ", ".join(d.get("origin_country", [])),
        "original_language": d.get("original_language"),
        "first_air_date": d.get("first_air_date"),
    }


@router.post("/tmdb/import/{tmdb_id}")
def admin_tmdb_import(tmdb_id: int, user=Depends(admin_required)):
    if not TMDB_API_KEY:
        raise HTTPException(status_code=500, detail="TMDB_API_KEY is not configured.")

    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # 1. Series details
        d = http_requests.get(f"{TMDB_BASE}/tv/{tmdb_id}?api_key={TMDB_API_KEY}&language=tr-TR", timeout=10).json()
        if "id" not in d:
            raise HTTPException(status_code=404, detail="TMDB'de bu dizi bulunamadi.")

        # External IDs
        ext_resp = http_requests.get(f"{TMDB_BASE}/tv/{tmdb_id}/external_ids?api_key={TMDB_API_KEY}", timeout=5)
        imdb_id = ext_resp.json().get("imdb_id") if ext_resp.status_code == 200 else None

        networks = ", ".join([n["name"] for n in d.get("networks", [])])
        created_by = ", ".join([c["name"] for c in d.get("created_by", [])])
        genres = ", ".join([g["name"] for g in d.get("genres", [])])
        origin_country = ", ".join(d.get("origin_country", []))

        # Upsert series
        cur.execute("""
            INSERT INTO series (series_id, name, rating, overview, poster_path, backdrop_path, status,
                               networks, created_by, genres, vote_count, imdb_id, origin_country,
                               original_language, first_air_date)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (series_id) DO UPDATE SET
                name=EXCLUDED.name, rating=EXCLUDED.rating, overview=EXCLUDED.overview,
                poster_path=EXCLUDED.poster_path, backdrop_path=EXCLUDED.backdrop_path,
                status=EXCLUDED.status, networks=EXCLUDED.networks, created_by=EXCLUDED.created_by,
                genres=EXCLUDED.genres, vote_count=EXCLUDED.vote_count, imdb_id=EXCLUDED.imdb_id,
                origin_country=EXCLUDED.origin_country, original_language=EXCLUDED.original_language,
                first_air_date=EXCLUDED.first_air_date
            RETURNING *
        """, (d["id"], d.get("name"), d.get("vote_average"), d.get("overview"),
              d.get("poster_path"), d.get("backdrop_path"), d.get("status"),
              networks, created_by, genres, d.get("vote_count", 0), imdb_id,
              origin_country, d.get("original_language"), d.get("first_air_date")))
        series_row = cur.fetchone()

        # 2. Seasons & Episodes
        cur.execute("DELETE FROM episodes WHERE season_id IN (SELECT season_id FROM seasons WHERE series_id = %s)", (tmdb_id,))
        cur.execute("DELETE FROM seasons WHERE series_id = %s", (tmdb_id,))

        for s in d.get("seasons", []):
            s_num = s["season_number"]
            if s_num == 0:
                continue

            s_detail = http_requests.get(
                f"{TMDB_BASE}/tv/{tmdb_id}/season/{s_num}?api_key={TMDB_API_KEY}&language=tr-TR", timeout=10
            ).json()
            time.sleep(0.05)

            if "season_number" not in s_detail:
                continue

            cur.execute("""
                INSERT INTO seasons (season_id, series_id, season_number, name, overview, air_date, poster_path)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (season_id) DO UPDATE SET
                    name=EXCLUDED.name, overview=EXCLUDED.overview,
                    air_date=EXCLUDED.air_date, poster_path=EXCLUDED.poster_path
                RETURNING season_id;
            """, (s.get("id"), tmdb_id, s_num, s.get("name"), s.get("overview"), s.get("air_date"), s.get("poster_path")))
            db_season_id = cur.fetchone()["season_id"]

            for ep in s_detail.get("episodes", []):
                cur.execute("""
                    INSERT INTO episodes (episode_id, season_id, episode_number, name, overview, air_date, runtime, still_path, vote_average)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (episode_id) DO UPDATE SET
                        name=EXCLUDED.name, overview=EXCLUDED.overview,
                        air_date=EXCLUDED.air_date, runtime=EXCLUDED.runtime,
                        still_path=EXCLUDED.still_path, vote_average=EXCLUDED.vote_average;
                """, (ep.get("id"), db_season_id, ep.get("episode_number"), ep.get("name"),
                      ep.get("overview"), ep.get("air_date"), ep.get("runtime"),
                      ep.get("still_path"), ep.get("vote_average")))

        # 3. Cast & Crew
        credits_data = http_requests.get(
            f"{TMDB_BASE}/tv/{tmdb_id}/credits?api_key={TMDB_API_KEY}&language=tr-TR", timeout=10
        ).json()
        time.sleep(0.05)

        cur.execute("DELETE FROM series_cast WHERE series_id = %s", (tmdb_id,))
        for i, actor in enumerate(credits_data.get("cast", [])[:20]):
            cur.execute("""
                INSERT INTO series_cast (cast_id, series_id, name, character, profile_path, credit_order)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (cast_id) DO UPDATE SET
                    name=EXCLUDED.name, character=EXCLUDED.character,
                    profile_path=EXCLUDED.profile_path, credit_order=EXCLUDED.credit_order
            """, (tmdb_id * 1000 + i, tmdb_id, actor.get("name"), actor.get("character"),
                  actor.get("profile_path"), actor.get("order")))

        cur.execute("DELETE FROM series_crew WHERE series_id = %s", (tmdb_id,))
        crew_counter = 0
        for crew in credits_data.get("crew", []):
            if crew.get("department") in ["Directing", "Writing", "Production", "Creator"]:
                cur.execute("""
                    INSERT INTO series_crew (crew_id, series_id, name, job, department, profile_path)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (crew_id) DO UPDATE SET
                        name=EXCLUDED.name, job=EXCLUDED.job,
                        department=EXCLUDED.department, profile_path=EXCLUDED.profile_path
                """, (tmdb_id * 1000 + crew_counter, tmdb_id, crew.get("name"), crew.get("job"),
                      crew.get("department"), crew.get("profile_path")))
                crew_counter += 1

        conn.commit()
        return {"status": "ok", "series": series_row}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# --------------- Hero Banner ---------------

class HeroSeriesModel(BaseModel):
    series_id: int
    display_order: Optional[int] = 0


class HeroReorderModel(BaseModel):
    items: list


@router.get("/hero-series")
def admin_list_hero_series(user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        cur.execute("""
            SELECT hs.id, hs.series_id, hs.display_order, hs.created_at,
                   s.name, s.poster_path, s.backdrop_path, s.rating
            FROM hero_series hs
            JOIN series s ON hs.series_id = s.series_id
            ORDER BY hs.display_order ASC, hs.created_at DESC
        """)
        items = cur.fetchall()
        return {"items": items}
    finally:
        cur.close()
        conn.close()


@router.post("/hero-series")
def admin_add_hero_series(data: HeroSeriesModel, user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Check max limit (30)
        cur.execute("SELECT COUNT(*) as count FROM hero_series")
        count = cur.fetchone()["count"]
        if count >= 30:
            raise HTTPException(status_code=400, detail="Maksimum 30 dizi eklenebilir.")

        cur.execute("SELECT series_id FROM series WHERE series_id = %s", (data.series_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail="Dizi bulunamadı.")
        cur.execute("SELECT id FROM hero_series WHERE series_id = %s", (data.series_id,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="Bu dizi zaten hero banner'da.")
        cur.execute(
            "INSERT INTO hero_series (series_id, display_order) VALUES (%s, %s) RETURNING id",
            (data.series_id, data.display_order)
        )
        new_id = cur.fetchone()["id"]
        conn.commit()
        return {"status": "ok", "id": new_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.delete("/hero-series/{series_id}")
def admin_delete_hero_series(series_id: int, user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM hero_series WHERE series_id = %s", (series_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Hero banner'da bu dizi yok.")
        conn.commit()
        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.put("/hero-series/reorder")
def admin_reorder_hero_series(data: HeroReorderModel, user=Depends(admin_required)):
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        for item in data.items:
            cur.execute(
                "UPDATE hero_series SET display_order = %s WHERE series_id = %s",
                (item.get("display_order", 0), item.get("series_id"))
            )
        conn.commit()
        return {"status": "ok"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/fix-missing-dates")
def admin_fix_missing_dates(user=Depends(admin_required)):
    """Fix series with missing first_air_date by getting date from first season/episode."""
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Find series with no first_air_date
        cur.execute("""
            SELECT series_id, name FROM series
            WHERE first_air_date IS NULL OR first_air_date = ''
        """)
        missing = cur.fetchall()
        fixed_count = 0

        for series in missing:
            sid = series["series_id"]
            # Try to get first season's air_date
            cur.execute("""
                SELECT air_date FROM seasons
                WHERE series_id = %s AND air_date IS NOT NULL
                ORDER BY season_number ASC LIMIT 1
            """, (sid,))
            season_row = cur.fetchone()

            if season_row and season_row["air_date"]:
                cur.execute(
                    "UPDATE series SET first_air_date = %s WHERE series_id = %s",
                    (season_row["air_date"], sid)
                )
                fixed_count += 1
                continue

            # Try to get first episode's air_date
            cur.execute("""
                SELECT e.air_date FROM episodes e
                JOIN seasons s ON e.season_id = s.season_id
                WHERE s.series_id = %s AND e.air_date IS NOT NULL
                ORDER BY s.season_number ASC, e.episode_number ASC LIMIT 1
            """, (sid,))
            ep_row = cur.fetchone()

            if ep_row and ep_row["air_date"]:
                cur.execute(
                    "UPDATE series SET first_air_date = %s WHERE series_id = %s",
                    (ep_row["air_date"], sid)
                )
                fixed_count += 1

        conn.commit()
        return {"status": "ok", "fixed_count": fixed_count, "total_missing": len(missing)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


# ────────────────────────────────────────────────────────────────────────────
# Settings Endpoints
# ────────────────────────────────────────────────────────────────────────────

@router.get("/settings/hero-shuffle")
def get_hero_shuffle_setting(user=Depends(admin_required)):
    """Get hero banner shuffle setting."""
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    try:
        # Ensure settings table exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()

        cur.execute("SELECT value FROM settings WHERE key = 'hero_shuffle_enabled'")
        row = cur.fetchone()
        enabled = row["value"] == "true" if row else False
        return {"enabled": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.put("/settings/hero-shuffle")
def update_hero_shuffle_setting(enabled: bool = Query(...), user=Depends(admin_required)):
    """Update hero banner shuffle setting."""
    conn = get_db_conn()
    cur = conn.cursor()
    try:
        # Ensure settings table exists
        cur.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(100) PRIMARY KEY,
                value TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        value = "true" if enabled else "false"
        cur.execute("""
            INSERT INTO settings (key, value, updated_at)
            VALUES ('hero_shuffle_enabled', %s, NOW())
            ON CONFLICT (key) DO UPDATE SET value = %s, updated_at = NOW()
        """, (value, value))
        conn.commit()
        return {"status": "ok", "enabled": enabled}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()
