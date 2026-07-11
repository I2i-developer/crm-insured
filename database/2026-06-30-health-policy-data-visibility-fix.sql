-- Health Policy CRM Data Visibility Fix
-- Run this in Supabase SQL Editor after database/complete-current-crm-schema.sql.
--
-- Purpose:
--   1. Make the CRM health-policy-only for now.
--   2. Backfill existing policies so they show in the frontend.
--   3. Promote the first available user to super_admin if no super_admin exists.
--
-- Why policies were not showing:
-- The frontend/API now filters policies by authenticated ownership for Team Members.
-- Old rows created before the ownership migration can have NULL user_id or belong to
-- another user. This script assigns orphan rows to a CRM owner and lets SuperAdmin
-- see the full team policy book.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'team_member');
    END IF;
END $$;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'team_member';

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

ALTER TABLE policies
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS policy_type TEXT DEFAULT 'Health Insurance',
    ADD COLUMN IF NOT EXISTS payment_due_date DATE;

ALTER TABLE interaction_logs
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS policy_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

DO $$
DECLARE
    crm_owner_id UUID;
BEGIN
    SELECT id INTO crm_owner_id
    FROM users
    ORDER BY
        CASE role
            WHEN 'super_admin' THEN 0
            WHEN 'admin' THEN 1
            ELSE 2
        END,
        created_at ASC
    LIMIT 1;

    IF crm_owner_id IS NULL THEN
        RAISE EXCEPTION 'No users found. Register/login once in the CRM first, then run this SQL again.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'super_admin') THEN
        UPDATE users
        SET role = 'super_admin'
        WHERE id = crm_owner_id;
    END IF;

    UPDATE policies
    SET user_id = crm_owner_id
    WHERE user_id IS NULL;

    UPDATE policies
    SET
        policy_type = 'Health Insurance',
        payment_due_date = COALESCE(payment_due_date, due_date),
        created_by = COALESCE(created_by, user_id),
        assigned_to = COALESCE(assigned_to, user_id)
    WHERE TRUE;

    UPDATE interaction_logs il
    SET user_id = p.user_id
    FROM policies p
    WHERE il.policy_id = p.id
      AND il.user_id IS NULL;

    IF EXISTS (SELECT 1 FROM policies WHERE user_id IS NULL) THEN
        RAISE EXCEPTION 'Some policies still have NULL user_id. Please inspect policies before continuing.';
    END IF;

    IF EXISTS (SELECT 1 FROM interaction_logs WHERE user_id IS NULL) THEN
        RAISE EXCEPTION 'Some interaction_logs still have NULL user_id. Please inspect interaction_logs before continuing.';
    END IF;

    ALTER TABLE policies ALTER COLUMN user_id SET NOT NULL;
    ALTER TABLE interaction_logs ALTER COLUMN user_id SET NOT NULL;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'policy_types_name_key'
    ) THEN
        ALTER TABLE policy_types
            ADD CONSTRAINT policy_types_name_key UNIQUE (name);
    END IF;
END $$;

INSERT INTO policy_types (name, description, is_active)
VALUES (
    'Health Insurance',
    'Health insurance policies for individuals, families, senior citizens, and groups.',
    TRUE
)
ON CONFLICT (name) DO UPDATE
SET
    description = EXCLUDED.description,
    is_active = TRUE,
    updated_at = CURRENT_TIMESTAMP;

UPDATE policy_types
SET is_active = FALSE,
    updated_at = CURRENT_TIMESTAMP
WHERE name <> 'Health Insurance';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_policies_user_id ON policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policies_user_due_date ON policies(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_policies_user_status ON policies(user_id, status);
CREATE INDEX IF NOT EXISTS idx_policies_policy_type ON policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_policies_payment_due_date ON policies(payment_due_date);
CREATE INDEX IF NOT EXISTS idx_interaction_logs_user_created_at ON interaction_logs(user_id, created_at DESC);

-- Optional: If you use multiple CRM users and want a specific login to see all
-- policies, set that user as SuperAdmin:
--
-- UPDATE users SET role = 'super_admin' WHERE email = 'your-login-email@example.com';
--
-- After running this file, refresh the app. If you were already logged in, the API
-- now checks the current Supabase role for policy visibility, but logging out and
-- logging back in is still recommended so the sidebar role label updates too.
