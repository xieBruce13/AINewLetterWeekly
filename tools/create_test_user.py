"""Create a test admin user in the Railway DB for debugging."""
import psycopg2, uuid, sys
try:
    import bcrypt
except ImportError:
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "bcrypt", "-q"])
    import bcrypt

sys.stdout.reconfigure(encoding="utf-8")

DB = "postgresql://postgres:fTjaIachqVRFfVXIXbkoGtsyjtEVcfZY@shuttle.proxy.rlwy.net:35509/railway"

TEST_EMAIL = "admin@ainewsletter.test"
TEST_PASSWORD = "Newsletter2026!"
TEST_NAME = "Admin"

pw_hash = bcrypt.hashpw(TEST_PASSWORD.encode(), bcrypt.gensalt(rounds=10)).decode()

conn = psycopg2.connect(DB)
conn.autocommit = True
cur = conn.cursor()

cur.execute("SELECT id FROM users WHERE email=%s", (TEST_EMAIL,))
existing = cur.fetchone()
if existing:
    # Update password hash
    cur.execute("UPDATE users SET password_hash=%s, display_name=%s WHERE email=%s",
                (pw_hash, TEST_NAME, TEST_EMAIL))
    print(f"✓ Updated existing test user: {TEST_EMAIL}")
else:
    uid = str(uuid.uuid4())
    cur.execute("""
        INSERT INTO users (id, email, name, display_name, password_hash, created_at)
        VALUES (%s, %s, %s, %s, %s, now())
    """, (uid, TEST_EMAIL, TEST_NAME, TEST_NAME, pw_hash))
    print(f"✓ Created test user: {TEST_EMAIL}")

print(f"\nTest credentials:")
print(f"  Email:    {TEST_EMAIL}")
print(f"  Password: {TEST_PASSWORD}")
print(f"\nGo to: https://ainewletterweekly-production.up.railway.app/signin")
print(f"and try logging in with these credentials to test if sign-in works.")

conn.close()
