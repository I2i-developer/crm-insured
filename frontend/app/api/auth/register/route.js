import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { hashPassword, signToken } from '@/lib/server-auth';
import { cleanString, isValidEmail } from '@/lib/validation';

export async function POST(request) {
  try {
    const { email, password, name } = await request.json();
    const cleanEmail = cleanString(email, 254).toLowerCase();
    const cleanName = cleanString(name, 120);

    if (!cleanEmail || !password || !cleanName) {
      return NextResponse.json({ error: 'Email, password and name are required' }, { status: 400 });
    }

    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: firstUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (firstUser) {
      return NextResponse.json({ error: 'Registration is closed. Ask the SuperAdmin to create your CRM user.' }, { status: 403 });
    }

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', cleanEmail)
      .single();

    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    const passwordHash = hashPassword(password);

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        email: cleanEmail,
        name: cleanName,
        role: 'super_admin',
        password_hash: passwordHash
      })
      .select()
      .single();

    if (userError) {
      console.error('User insert error:', userError);
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    const token = signToken(userData);

    return NextResponse.json({
      message: 'User registered successfully',
      token,
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        role: userData.role || 'team_member',
        avatar_url: userData.avatar_url || '',
        designation: userData.designation || ''
      }
    }, { status: 201 });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
