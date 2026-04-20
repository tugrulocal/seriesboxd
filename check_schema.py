import psycopg2
conn = psycopg2.connect(dbname='seriesboxd', user='postgres', password='1234', host='localhost', port='5432')
cur = conn.cursor()
for tbl in ['seasons', 'episodes', 'series_cast', 'series_crew']:
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name=%s ORDER BY ordinal_position", (tbl,))
    cols = cur.fetchall()
    print(f'--- {tbl} ---')
    for c in cols: print(f'  {c[0]}: {c[1]}')
cur.close(); conn.close()