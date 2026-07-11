import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, getUserIdFromRequest } from '@/lib/server-auth';
import { cleanString, isValidEmail } from '@/lib/validation';

function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role || 'team_member',
    avatar_url: user.avatar_url || '',
    designation: user.designation || ''
  };
}

export async function GET(request) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Supabase user query failed:', error);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: toPublicUser(user) });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
  }
}

export async function PUT(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const input = await request.json();
    const name = cleanString(input.name, 120);
    const email = cleanString(input.email, 254).toLowerCase();
    const avatarUrl = cleanString(input.avatar_url, 1000);
    const designation = cleanString(input.designation, 120);

    if (!name || !email) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
      return NextResponse.json({ error: 'Profile picture must be a valid http or https URL' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .neq('id', auth.userId)
      .single();

    if (existingUser) {
      return NextResponse.json({ error: 'Email already belongs to another user' }, { status: 400 });
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update({
        name,
        email,
        avatar_url: avatarUrl || null,
        designation: designation || null
      })
      .eq('id', auth.userId)
      .select('*')
      .single();

    if (error?.message?.includes('avatar_url') || error?.code === 'PGRST204') {
      return NextResponse.json({
        error: 'Profile picture storage is not ready. Run database/2026-07-08-user-avatar-schema-cache-fix.sql in Supabase SQL Editor, then try again.'
      }, { status: 400 });
    }

    if (error || !user) {
      return NextResponse.json({ error: error?.message || 'Failed to update profile' }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'profile.update',
      entityType: 'user',
      entityId: user.id,
      summary: `Updated profile for ${user.email}`,
      metadata: { updated_email: user.email }
    });

    return NextResponse.json({
      message: 'Profile updated successfully',
      user: toPublicUser(user)
    });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
