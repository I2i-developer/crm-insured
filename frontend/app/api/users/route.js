import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, hashPassword, isSuperAdminRole, USER_ROLES } from '@/lib/server-auth';
import { cleanString, isValidEmail } from '@/lib/validation';

const CREATABLE_ROLES = [USER_ROLES.ADMIN, USER_ROLES.TEAM_MEMBER];

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || USER_ROLES.TEAM_MEMBER,
    designation: user.designation || '',
    avatar_url: user.avatar_url || '',
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isSuperAdminRole(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, designation, avatar_url, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ users: (data || []).map(publicUser) });
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
        designation: designation || null,
        password_hash: hashPassword(password)
      })
      .select('id, email, name, role, designation, avatar_url, created_at, updated_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAuditLog(request, auth, {
      action: 'user.create',
      entityType: 'user',
      entityId: user.id,
      summary: `Created ${role} user ${email}`,
      metadata: { created_user_email: email, created_user_role: role }
    });

    return NextResponse.json({ message: 'User created successfully', user: publicUser(user) }, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
