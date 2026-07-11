-- Lead Management for Health Policy CRM
-- Run this in Supabase SQL Editor after the current CRM schema/data-visibility SQL.
--
-- Adds:
--   - leads table for incoming health-policy leads
--   - lead_remarks table with a maximum of 5 remarks per lead
--   - indexes, updated_at trigger, RLS hardening
--
-- The app accesses these tables through Next.js API routes using SUPABASE_SERVICE_KEY.
-- No direct browser table policies are created.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    source TEXT,
    stage TEXT NOT NULL DEFAULT 'New',
    priority TEXT NOT NULL DEFAULT 'Medium',
    expected_premium NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (expected_premium >= 0),
    next_follow_up DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT leads_stage_check CHECK (stage IN ('New', 'Contacted', 'Qualified', 'Proposal', 'Converted', 'Lost')),
    CONSTRAINT leads_priority_check CHECK (priority IN ('Low', 'Medium', 'High'))
);

CREATE TABLE IF NOT EXISTS lead_remarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remark TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS client_name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'New',
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Medium',
    ADD COLUMN IF NOT EXISTS expected_premium NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (expected_premium >= 0),
    ADD COLUMN IF NOT EXISTS next_follow_up DATE,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE lead_remarks
    ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS remark TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leads_stage_check'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT leads_stage_check CHECK (stage IN ('New', 'Contacted', 'Qualified', 'Proposal', 'Converted', 'Lost'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'leads_priority_check'
    ) THEN
        ALTER TABLE leads
            ADD CONSTRAINT leads_priority_check CHECK (priority IN ('Low', 'Medium', 'High'));
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM leads WHERE user_id IS NULL) THEN
        RAISE NOTICE 'Existing leads have NULL user_id. Backfill leads.user_id before enforcing NOT NULL.';
    ELSE
        ALTER TABLE leads ALTER COLUMN user_id SET NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM leads WHERE client_name IS NULL OR trim(client_name) = '') THEN
        RAISE NOTICE 'Existing leads have missing client_name. Fix those rows before enforcing NOT NULL.';
    ELSE
        ALTER TABLE leads ALTER COLUMN client_name SET NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM lead_remarks WHERE lead_id IS NULL OR user_id IS NULL OR remark IS NULL OR trim(remark) = '') THEN
        RAISE NOTICE 'Existing lead_remarks have missing required fields. Fix those rows before enforcing NOT NULL.';
    ELSE
        ALTER TABLE lead_remarks ALTER COLUMN lead_id SET NOT NULL;
        ALTER TABLE lead_remarks ALTER COLUMN user_id SET NOT NULL;
        ALTER TABLE lead_remarks ALTER COLUMN remark SET NOT NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_remarks_lead_created_at ON lead_remarks(lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_leads_updated_at ON leads;
CREATE TRIGGER update_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION enforce_lead_remarks_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT count(*) FROM lead_remarks WHERE lead_id = NEW.lead_id) >= 5 THEN
        RAISE EXCEPTION 'A lead can have a maximum of 5 remarks';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_lead_remarks_limit_trigger ON lead_remarks;
CREATE TRIGGER enforce_lead_remarks_limit_trigger
    BEFORE INSERT ON lead_remarks
    FOR EACH ROW
    EXECUTE FUNCTION enforce_lead_remarks_limit();

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read leads" ON leads;
DROP POLICY IF EXISTS "Public insert leads" ON leads;
DROP POLICY IF EXISTS "Public update leads" ON leads;
DROP POLICY IF EXISTS "Public delete leads" ON leads;
DROP POLICY IF EXISTS "Public read lead_remarks" ON lead_remarks;
DROP POLICY IF EXISTS "Public insert lead_remarks" ON lead_remarks;
DROP POLICY IF EXISTS "Public update lead_remarks" ON lead_remarks;
DROP POLICY IF EXISTS "Public delete lead_remarks" ON lead_remarks;
