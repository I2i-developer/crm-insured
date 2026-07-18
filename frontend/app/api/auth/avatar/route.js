import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest } from '@/lib/server-auth';

const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function getExtension(file) {
  const fromName = String(file.name || '').split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(fromName)) return fromName === 'jpg' ? 'jpeg' : fromName;
  return {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
  }[file.type] || 'png';
}

async function ensureAvatarBucket(supabaseAdmin) {
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if ((buckets || []).some(bucket => bucket.name === AVATAR_BUCKET)) return;

  const { error } = await supabaseAdmin.storage.createBucket(AVATAR_BUCKET, {
    public: true,
    fileSizeLimit: MAX_AVATAR_SIZE,
    allowedMimeTypes: Array.from(ALLOWED_TYPES)
  });

  if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
    throw error;
  }
}

export async function POST(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('avatar');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Profile image is required' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Upload a JPG, PNG, WEBP, or GIF profile image' }, { status: 400 });
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json({ error: 'Profile image must be 2MB or smaller' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    await ensureAvatarBucket(supabaseAdmin);

    const extension = getExtension(file);
    const path = `${auth.userId}/avatar-${Date.now()}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(path, bytes, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(path);

    const avatarUrl = publicUrlData?.publicUrl || '';
    const { data: user, error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: avatarUrl })
      .eq('id', auth.userId)
      .select('id, email, name, role, avatar_url, designation')
      .single();

    if (updateError || !user) {
      return NextResponse.json({ error: updateError?.message || 'Failed to update profile image' }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'profile.avatar_upload',
      entityType: 'user',
      entityId: user.id,
      summary: `Uploaded profile image for ${user.email}`,
      metadata: { avatar_url: avatarUrl }
    });

    return NextResponse.json({
      message: 'Profile image uploaded successfully',
      avatar_url: avatarUrl,
      user
    });
  } catch (error) {
    console.error('Profile image upload error:', error);
    return NextResponse.json({ error: 'Failed to upload profile image' }, { status: 500 });
  }
}
