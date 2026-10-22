import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, hashPassword, isSuperAdminRole, USER_ROLES } from '@/lib/server-auth';
import { cleanString, isValidEmail } from '@/lib/validation';

const CREATABLE_ROLES = [USER_ROLES.ADMIN, USER_ROLES.TEAM_HEAD, USER_ROLES.TEAM_MEMBER];

async function safeUpdate(supabaseAdmin, table, values, column, userId) {
  const { error } = await supabaseAdmin
    .from(table)
    .update(values)
    .eq(column, userId);

  if (error && !['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error.code)) {
    throw error;
  }
}

async function transferUserRecords(supabaseAdmin, fromUserId, toUserId) {
  await safeUpdate(supabaseAdmin, 'users', { reports_to: null }, 'reports_to', fromUserId);
  await safeUpdate(supabaseAdmin, 'clients', { user_id: toUserId }, 'user_id', fromUserId);
  await safeUpdate(supabaseAdmin, 'clients', { assigned_to: null }, 'assigned_to', fromUserId);

  await safeUpdate(supabaseAdmin, 'policies', { user_id: toUserId }, 'user_id', fromUserId);
  await safeUpdate(supabaseAdmin, 'policies', { assigned_to: null }, 'assigned_to', fromUserId);
  await safeUpdate(supabaseAdmin, 'policies', { created_by: toUserId }, 'created_by', fromUserId);

  await safeUpdate(supabaseAdmin, 'interaction_logs', { user_id: toUserId }, 'user_id', fromUserId);

  await safeUpdate(supabaseAdmin, 'leads', { user_id: toUserId }, 'user_id', fromUserId);
  await safeUpdate(supabaseAdmin, 'leads', { assigned_to: null }, 'assigned_to', fromUserId);

  await safeUpdate(supabaseAdmin, 'lead_remarks', { user_id: toUserId }, 'user_id', fromUserId);
}

function publicUser(user, managerMap = new Map()) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || USER_ROLES.TEAM_MEMBER,
    designation: user.designation || '',
    avatar_url: user.avatar_url || '',
    reports_to: user.reports_to || '',
    manager_name: managerMap.get(user.reports_to)?.name || '',
    manager_role: managerMap.get(user.reports_to)?.role || '',
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

async function validateReportingManager(supabaseAdmin, role, reportsTo, userId = '') {
  if ([USER_ROLES.ADMIN, USER_ROLES.TEAM_HEAD].includes(role)) return { reportsTo: null };

  const requiredRole = USER_ROLES.TEAM_HEAD;
  const requiredLabel = 'Team Head';

  if (!reportsTo) return { error: `${requiredLabel} assignment is required for this role` };
  if (reportsTo === userId) return { error: 'A user cannot report to themselves' };

  const { data: manager, error } = await supabaseAdmin
    .from('users')
    .select('id, role')
    .eq('id', reportsTo)
    .single();

  if (error || !manager || manager.role !== requiredRole) {
    return { error: `Selected reporting manager must be an ${requiredLabel}` };
  }

  return { reportsTo: manager.id };
}

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isSuperAdminRole(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, designation, avatar_url, reports_to, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    const managerMap = new Map((data || []).map(user => [user.id, user]));
    return NextResponse.json({ users: (data || []).map(user => publicUser(user, managerMap)) });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isSuperAdminRole(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const input = await request.json();
    const name = cleanString(input.name, 120);
    const email = cleanString(input.email, 254).toLowerCase();
    const password = typeof input.password === 'string' ? input.password : '';
    const role = CREATABLE_ROLES.includes(input.role) ? input.role : '';
    const designation = cleanString(input.designation, 120);
    const reportsTo = cleanString(input.reports_to, 80);

    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Name, email, password and role are required' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const reporting = await validateReportingManager(supabaseAdmin, role, reportsTo);
    if (reporting.error) {
      return NextResponse.json({ error: reporting.error }, { status: 400 });
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        email,
        name,
        role,
        reports_to: reporting.reportsTo,
        designation: designation || null,
        password_hash: hashPassword(password)
      })
      .select('id, email, name, role, designation, avatar_url, reports_to, created_at, updated_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAuditLog(request, auth, {
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      summary: `Created ${role} user ${email}`,
      metadata: { created_user_email: email, created_user_role: role, reports_to: reporting.reportsTo }
    });

    return NextResponse.json({ message: 'User created successfully', user: publicUser(user) }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isSuperAdminRole(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const input = await request.json();
    const userId = cleanString(input.id, 80);
    const name = cleanString(input.name, 120);
    const email = cleanString(input.email, 254).toLowerCase();
    const role = CREATABLE_ROLES.includes(input.role) ? input.role : '';
    const designation = cleanString(input.designation, 120);
    const reportsTo = cleanString(input.reports_to, 80);
    const password = typeof input.password === 'string' ? input.password : '';

    if (!userId || !name || !email || !role) {
      return NextResponse.json({ error: 'User, name, email and role are required' }, { status: 400 });
    }
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    if (password && password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: currentUser, error: currentError } = await supabaseAdmin
      .from('users')
      .select('id, role, email')
      .eq('id', userId)
      .single();

    if (currentError || !currentUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (currentUser.role === USER_ROLES.SUPER_ADMIN) {
      return NextResponse.json({ error: 'SuperAdmin role cannot be changed here' }, { status: 400 });
    }

    if (currentUser.role !== role && [USER_ROLES.ADMIN, USER_ROLES.TEAM_HEAD].includes(currentUser.role)) {
      const { count: directReportCount, error: reportCountError } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('reports_to', userId);
      if (reportCountError) return NextResponse.json({ error: reportCountError.message }, { status: 400 });
      if ((directReportCount || 0) > 0) {
        return NextResponse.json({ error: 'Reassign this user’s direct reports before changing their role' }, { status: 409 });
      }
    }

    const reporting = await validateReportingManager(supabaseAdmin, role, reportsTo, userId);
    if (reporting.error) return NextResponse.json({ error: reporting.error }, { status: 400 });

    const updates = {
      name,
      email,
      role,
      designation: designation || null,
      reports_to: reporting.reportsTo
    };
    if (password) updates.password_hash = hashPassword(password);

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('id, email, name, role, designation, avatar_url, reports_to, created_at, updated_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAuditLog(request, auth, {
      action: 'user.update',
      entityType: 'user',
      entityId: user.id,
      summary: `Updated ${role} user ${email}`,
      metadata: { previous_role: currentUser.role, updated_role: role, reports_to: reporting.reportsTo }
    });

    return NextResponse.json({ message: 'User updated successfully', user: publicUser(user) });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isSuperAdminRole(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userId = cleanString(searchParams.get('id'), 80);

    if (!userId) {
      return NextResponse.json({ error: 'User id is required' }, { status: 400 });
    }

    if (userId === auth.userId) {
      return NextResponse.json({ error: 'You cannot delete your own SuperAdmin account' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (isSuperAdminRole(user.role)) {
      const { count, error: countError } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', USER_ROLES.SUPER_ADMIN);

      if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
      if ((count || 0) <= 1) {
        return NextResponse.json({ error: 'At least one SuperAdmin must remain in the CRM' }, { status: 400 });
      }
    }

    await transferUserRecords(supabaseAdmin, user.id, auth.userId);

    await writeAuditLog(request, auth, {
      action: 'user.delete',
      entityType: 'user',
      entityId: user.id,
      summary: `Deleted ${user.role} user ${user.email}`,
      metadata: { deleted_user_email: user.email, deleted_user_role: user.role, deleted_user_name: user.name }
    });

    const { error } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}
