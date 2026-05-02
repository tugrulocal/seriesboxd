# New endpoints for followers, following, and watched series

@app.get("/followers/{username}")
def get_followers(username: str, user = Depends(get_current_user)):
    lazy_init_db()
    target = _get_user_by_username(username)
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT u.user_id, u.username, u.avatar, u.bio FROM users u JOIN user_follows uf ON u.user_id = uf.follower_id WHERE uf.following_id = %s ORDER BY u.username ASC", (target["user_id"],))
    followers = cur.fetchall()
    cur.close()
    conn.close()
    return followers


@app.get("/following/{username}")
def get_following(username: str, user = Depends(get_current_user)):
    lazy_init_db()
    target = _get_user_by_username(username)
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT u.user_id, u.username, u.avatar, u.bio FROM users u JOIN user_follows uf ON u.user_id = uf.following_id WHERE uf.follower_id = %s ORDER BY u.username ASC", (target["user_id"],))
    following = cur.fetchall()
    cur.close()
    conn.close()
    return following


@app.get("/watched-series/{username}")
def get_user_watched_series(username: str, user = Depends(get_current_user)):
    lazy_init_db()
    target = _get_user_by_username(username)
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı.")
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute("SELECT DISTINCT s.series_id, s.name, s.poster_path, s.rating FROM user_activity ua JOIN series s ON ua.series_id = s.series_id JOIN episodes e ON ua.episode_id = e.episode_id WHERE ua.user_id = %s AND ua.activity_type = 'watched' UNION SELECT s.series_id, s.name, s.poster_path, s.rating FROM user_series_activity usa JOIN series s ON usa.series_id = s.series_id WHERE usa.user_id = %s AND usa.activity_type = 'watched' ORDER BY name ASC", (target["user_id"], target["user_id"]))
    watched_series = cur.fetchall()
    cur.close()
    conn.close()
    return watched_series
