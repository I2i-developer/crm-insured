-- User Profile Settings
-- Run this in Supabase SQL Editor to support profile pictures and designations.
--
-- Adds optional profile fields used by the CRM header popover and settings page.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
