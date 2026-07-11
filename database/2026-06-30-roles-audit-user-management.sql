-- Roles, SuperAdmin User Management, and CRM Audit Logs
-- Run this in Supabase SQL Editor after the current CRM schema files.
--
-- Adds:
--   - optional user profile fields if not already present
--   - audit_logs table for CRM activity tracking
--   - indexes and RLS hardening

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS designation TEXT;

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    summary TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE audit_logs
    ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS actor_email TEXT,
    ADD COLUMN IF NOT EXISTS actor_role TEXT,
    ADD COLUMN IF NOT EXISTS action TEXT,
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id TEXT,
    ADD COLUMN IF NOT EXISTS summary TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS ip_address TEXT,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM audit_logs WHERE action IS NULL OR entity_type IS NULL OR summary IS NULL) THEN
        RAISE NOTICE 'Existing audit_logs have missing required fields. Fix those rows before enforcing NOT NULL.';
    ELSE
        ALTER TABLE audit_logs ALTER COLUMN action SET NOT NULL;
        ALTER TABLE audit_logs ALTER COLUMN entity_type SET NOT NULL;
        ALTER TABLE audit_logs ALTER COLUMN summary SET NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Public insert audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Public update audit_logs" ON audit_logs;
DROP POLICY IF EXISTS "Public delete audit_logs" ON audit_logs;

-- SuperAdmin-only access is enforced in Next.js API routes using SUPABASE_SERVICE_KEY.
