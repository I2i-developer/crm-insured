-- Migration for existing databases created from the previous public-access schema.
-- Review the BACKFILL section before running this in Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'team_member');
    END IF;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'team_member';

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    lead_stage TEXT NOT NULL DEFAULT 'Lead',
    source TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS policy_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE policies ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'General';
ALTER TABLE policies ADD COLUMN IF NOT EXISTS payment_due_date DATE;

-- BACKFILL REQUIRED:
-- If you already have policies, assign them to the correct user before enforcing NOT NULL.
-- For a single-user demo database, uncomment and run this after replacing the email:
--
-- UPDATE policies
-- SET user_id = (SELECT id FROM users WHERE email = 'owner@example.com')
-- WHERE user_id IS NULL;
--
-- UPDATE interaction_logs il
-- SET user_id = p.user_id
-- FROM policies p
-- WHERE il.policy_id = p.id AND il.user_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM policies WHERE user_id IS NULL) THEN
        RAISE EXCEPTION 'Backfill policies.user_id before continuing';
    END IF;

    IF EXISTS (SELECT 1 FROM interaction_logs WHERE user_id IS NULL) THEN
        RAISE EXCEPTION 'Backfill interaction_logs.user_id before continuing';
    END IF;
END $$;

ALTER TABLE policies ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE interaction_logs ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE policies DROP CONSTRAINT IF EXISTS policies_policy_number_key;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'policies_user_policy_number_unique'
    ) THEN
        ALTER TABLE policies
            ADD CONSTRAINT policies_user_policy_number_unique UNIQUE (user_id, policy_number);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_policies_user_id ON policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policies_user_due_date ON policies(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_policies_user_status ON policies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_user_client_name ON policies(user_id, client_name);
CREATE INDEX IF NOT EXISTS idx_policies_user_insurance_company ON policies(user_id, insurance_company);
CREATE INDEX IF NOT EXISTS idx_policies_assigned_to ON policies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_policies_policy_type ON policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_policies_payment_due_date ON policies(payment_due_date);
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_assigned_to ON clients(assigned_to);
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_user_created_at ON interaction_logs(user_id, created_at DESC);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read policies" ON policies;
DROP POLICY IF EXISTS "Public insert policies" ON policies;
DROP POLICY IF EXISTS "Public update policies" ON policies;
DROP POLICY IF EXISTS "Public delete policies" ON policies;
DROP POLICY IF EXISTS "Public read interaction_logs" ON interaction_logs;
DROP POLICY IF EXISTS "Public insert interaction_logs" ON interaction_logs;
DROP POLICY IF EXISTS "Public update interaction_logs" ON interaction_logs;
DROP POLICY IF EXISTS "Public delete interaction_logs" ON interaction_logs;
DROP POLICY IF EXISTS "Public read users" ON users;
DROP POLICY IF EXISTS "Public insert users" ON users;
DROP POLICY IF EXISTS "Public update users" ON users;
DROP POLICY IF EXISTS "Public read clients" ON clients;
DROP POLICY IF EXISTS "Public insert clients" ON clients;
DROP POLICY IF EXISTS "Public update clients" ON clients;
DROP POLICY IF EXISTS "Public delete clients" ON clients;
DROP POLICY IF EXISTS "Public read policy_types" ON policy_types;
DROP POLICY IF EXISTS "Public insert policy_types" ON policy_types;
DROP POLICY IF EXISTS "Public update policy_types" ON policy_types;
DROP POLICY IF EXISTS "Public delete policy_types" ON policy_types;
