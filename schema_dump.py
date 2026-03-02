import psycopg2
conn = psycopg2.connect(dbname="seriesboxd", user="postgres", password="1234", host="localhost")
cur = conn.cursor()
for table in ['series', 'episodes', 'user_activity', 'user_series_activity']:
    cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}';")
    print(f"--- {table} ---")
    for row in cur.fetchall(): print(row)
