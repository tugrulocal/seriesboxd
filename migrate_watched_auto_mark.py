#!/usr/bin/env python3
"""
Migration script to auto-mark series as watched for existing users
who have watched all episodes of a series.

This script:
1. Finds all users
2. For each user, checks which series have 100% episode completion
3. If a series is 100% complete but not marked as watched at series level, marks it
4. Logs the migration results
"""

import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

# Database connection parameters
DB_PARAMS = {
    "host": "dpg-cth8c4d269vc73983jv0-a.frankfurt-postgres.render.com",
    "database": "seriesboxd_production_database",
    "user": "seriesboxd_user",
    "password": "xKh9P8L2mQ5vB6wN3zC7",
    "port": 5432
}

def get_db_conn():
    return psycopg2.connect(**DB_PARAMS)

def migrate_watched_auto_mark():
    """
    Migrate existing users: auto-mark series as watched if all episodes are watched.
    """
    conn = get_db_conn()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    print("=" * 70)
    print("SeriesBoxd - Auto-Mark Series Migration")
    print(f"Started at: {datetime.now().isoformat()}")
    print("=" * 70)
    
    migration_count = 0
    series_marked_count = 0
    errors = []
    
    try:
        # Get all users
        cur.execute("SELECT user_id FROM users ORDER BY user_id")
        users = cur.fetchall()
        total_users = len(users)
        
        print(f"\nProcessing {total_users} users...")
        
        for user_idx, user_row in enumerate(users, 1):
            user_id = user_row['user_id']
            
            try:
                # Find all series where user has watched episodes
                cur.execute("""
                    SELECT DISTINCT series_id FROM user_activity 
                    WHERE user_id = %s AND activity_type = 'watched'
                """, (user_id,))
                
                series_with_activity = cur.fetchall()
                
                for series_row in series_with_activity:
                    series_id = series_row['series_id']
                    
                    # Count total episodes in series
                    cur.execute("""
                        SELECT COUNT(*) as total FROM episodes 
                        WHERE season_id IN (SELECT season_id FROM seasons WHERE series_id = %s)
                    """, (series_id,))
                    total_result = cur.fetchone()
                    total_episodes = total_result['total'] if total_result else 0
                    
                    if total_episodes == 0:
                        continue  # Skip series with no episodes
                    
                    # Count watched episodes by user
                    cur.execute("""
                        SELECT COUNT(*) as watched FROM user_activity 
                        WHERE user_id = %s AND series_id = %s AND activity_type = 'watched'
                    """, (user_id, series_id))
                    watched_result = cur.fetchone()
                    watched_episodes = watched_result['watched'] if watched_result else 0
                    
                    # If all episodes watched and series not marked at series level
                    if watched_episodes == total_episodes and watched_episodes > 0:
                        # Check if already marked
                        cur.execute("""
                            SELECT 1 FROM user_series_activity 
                            WHERE user_id = %s AND series_id = %s AND activity_type = 'watched'
                        """, (user_id, series_id))
                        
                        if not cur.fetchone():
                            # Get the earliest watch timestamp for proper ordering
                            cur.execute("""
                                SELECT MIN(created_at) as min_date FROM user_activity
                                WHERE user_id = %s AND series_id = %s AND activity_type = 'watched'
                            """, (user_id, series_id))
                            date_result = cur.fetchone()
                            created_at = date_result['min_date'] if date_result else None
                            
                            # Mark series as watched
                            if created_at:
                                cur.execute("""
                                    INSERT INTO user_series_activity (user_id, series_id, activity_type, created_at)
                                    VALUES (%s, %s, 'watched', %s)
                                    ON CONFLICT (user_id, series_id, activity_type) DO NOTHING
                                """, (user_id, series_id, created_at))
                            else:
                                cur.execute("""
                                    INSERT INTO user_series_activity (user_id, series_id, activity_type)
                                    VALUES (%s, %s, 'watched')
                                    ON CONFLICT (user_id, series_id, activity_type) DO NOTHING
                                """, (user_id, series_id))
                            
                            conn.commit()
                            series_marked_count += 1
                
                migration_count += 1
                
                # Progress indicator
                if user_idx % 10 == 0 or user_idx == total_users:
                    print(f"  ✓ Processed {user_idx}/{total_users} users ({series_marked_count} series marked so far)")
                    
            except Exception as e:
                error_msg = f"Error processing user {user_id}: {str(e)}"
                print(f"  ✗ {error_msg}")
                errors.append(error_msg)
                conn.rollback()
                continue
        
        cur.close()
        conn.close()
        
        # Final summary
        print("\n" + "=" * 70)
        print("Migration Summary:")
        print(f"  Users processed: {migration_count}/{total_users}")
        print(f"  Series marked as watched: {series_marked_count}")
        print(f"  Errors encountered: {len(errors)}")
        
        if errors:
            print("\nErrors:")
            for error in errors:
                print(f"  - {error}")
        
        print(f"\nCompleted at: {datetime.now().isoformat()}")
        print("=" * 70)
        
        return {
            'success': True,
            'users_processed': migration_count,
            'series_marked': series_marked_count,
            'errors': errors
        }
        
    except Exception as e:
        print(f"\n✗ Migration failed with error: {str(e)}")
        conn.rollback()
        cur.close()
        conn.close()
        return {
            'success': False,
            'error': str(e)
        }

if __name__ == '__main__':
    result = migrate_watched_auto_mark()
    exit(0 if result['success'] else 1)
