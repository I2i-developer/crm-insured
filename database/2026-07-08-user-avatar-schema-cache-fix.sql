-- User Avatar Schema Cache Fix
-- Run this in Supabase SQL Editor if profile picture updates show:
-- "Could not find the 'avatar_url' column of 'users' in the schema cache".
--
-- This adds the profile columns used by the CRM and asks PostgREST/Supabase
-- to reload its schema cache.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

NOTIFY pgrst, 'reload schema';
