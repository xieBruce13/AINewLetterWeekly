-- 0001 — add password-based auth.
-- China-friendly sign-in path: no Google OAuth, no email magic-link required.
-- Users sign up with email + password; bcrypt hash lives on the users row.
-- Existing rows (created via demo / magic link) keep password_hash NULL —
-- those users are still able to sign in via their original provider, just
-- not the password form.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;
