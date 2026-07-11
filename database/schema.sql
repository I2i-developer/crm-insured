-- Insurance Renewal Management Portal - Database Schema
-- Run this in Supabase SQL Editor.
--
-- The app uses Next.js API routes with SUPABASE_SERVICE_KEY for database access.
-- Public browser access to tables is intentionally blocked by RLS.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'policy_status') THEN
        CREATE TYPE policy_status AS ENUM ('Paid', 'Pending', 'Overdue', 'Grace Period', 'Lapsed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'team_member');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'team_member',
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS policies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    policy_type TEXT DEFAULT 'General',
    insurance_company TEXT NOT NULL,
    policy_number TEXT NOT NULL,
    premium_amount NUMERIC(12, 2) NOT NULL CHECK (premium_amount >= 0),
    due_date DATE NOT NULL,
    payment_due_date DATE,
    issuance_date DATE NOT NULL,
    phone TEXT,
    email TEXT,
    status policy_status DEFAULT 'Pending',
    last_alert_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT policies_user_policy_number_unique UNIQUE (user_id, policy_number)
);

CREATE TABLE IF NOT EXISTS interaction_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remark TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Compatibility for databases that were created with the earlier schema.
-- CREATE TABLE IF NOT EXISTS does not add new columns to existing tables.
ALTER TABLE policies
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE interaction_logs
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'team_member';

ALTER TABLE policies
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'General',
    ADD COLUMN IF NOT EXISTS payment_due_date DATE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM policies WHERE user_id IS NULL) THEN
        RAISE NOTICE 'Existing policies have NULL user_id. Assign them to a user, then run database/migrate-secure-ownership.sql to enforce NOT NULL ownership.';
    ELSE
        ALTER TABLE policies ALTER COLUMN user_id SET NOT NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM interaction_logs WHERE user_id IS NULL) THEN
        RAISE NOTICE 'Existing interaction_logs have NULL user_id. Backfill from policies.user_id, then run database/migrate-secure-ownership.sql to enforce NOT NULL ownership.';
    ELSE
        ALTER TABLE interaction_logs ALTER COLUMN user_id SET NOT NULL;
    END IF;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_interaction_logs_policy_id ON interaction_logs(policy_id);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_user_created_at ON interaction_logs(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_policies_updated_at ON policies;
CREATE TRIGGER update_policies_updated_at
    BEFORE UPDATE ON policies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_policy_types_updated_at ON policy_types;
CREATE TRIGGER update_policy_types_updated_at
    BEFORE UPDATE ON policy_types
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

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

-- No direct anon/authenticated browser table policies are created.
-- All table access should go through the app's server routes using the service role key.
