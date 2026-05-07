"""Diagnose auth/registration setup on Railway DB."""
import psycopg2, json, sys, uuid
sys.stdout.reconfigure(encoding="utf-8")

DB = "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"
conn = psycopg2.connect(DB)
conn.autocommit = False
cur = conn.cursor()

# 1. Check users table schema
cur.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name='users'
    ORDER BY ordinal_position;
""")
print("users table columns:")
for row in cur.fetchall():
    print(f"  {row[0]:25} {row[1]:20} nullable={row[2]}")

# 2. Try inserting a test user to verify schema is correct
import hashlib
test_id = str(uuid.uuid4())
test_email = "test_diagnostic@example.com"

# Check if test user already exists
cur.execute("SELECT id FROM users WHERE email=%s", (test_email,))
existing = cur.fetchone()
if existing:
    print(f"\nTest user already exists: {existing[0]}")
else:
    try:
        cur.execute("""
            INSERT INTO users (id, email, name, display_name, password_hash, created_at)
            VALUES (%s, %s, %s, %s, %s, now())
        """, (test_id, test_email, "Test User", "Test User", "$2b$10$test_hash_placeholder"))
        conn.commit()
        print(f"\n✓ Test user insert succeeded (id={test_id})")
        # Clean up
        cur.execute("DELETE FROM users WHERE id=%s", (test_id,))
        conn.commit()
        print("✓ Test user cleaned up")
    except Exception as e:
        conn.rollback()
        print(f"\n✗ Test user insert FAILED: {e}")

# 3. Check existing users
cur.execute("SELECT id, email, display_name, password_hash IS NOT NULL as has_password FROM users;")
users = cur.fetchall()
print(f"\nExisting users ({len(users)}):")
for u in users:
    print(f"  {u[1]:40} has_password={u[3]}")

conn.close()
