import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { hashPassword, signToken, verifyPassword } from '@/lib/server-auth';
import { cleanString } from '@/lib/validation';

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    const cleanEmail = cleanString(email, 254).toLowerCase();

    if (!cleanEmail || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', cleanEmail)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    const verification = verifyPassword(password, user.password_hash);

    if (!verification.valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (verification.needsRehash) {
      await supabaseAdmin
        .from('users')
        .update({ password_hash: hashPassword(password) })
        .eq('id', user.id);
    }

    const token = signToken(user);

    return NextResponse.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role || 'team_member',
        avatar_url: user.avatar_url || '',
        designation: user.designation || ''
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
