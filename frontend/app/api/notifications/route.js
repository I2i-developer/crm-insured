import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest } from '@/lib/server-auth';
import { cleanString } from '@/lib/validation';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('user_notifications')
      .select('id, notification_type, title, message, href, entity_id, is_read, read_at, created_at')
      .eq('recipient_user_id', auth.userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ notifications: data || [] });
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const input = await request.json();
    const id = cleanString(input.id, 80);
    const markAll = input.all === true;
    if (!markAll && !UUID_PATTERN.test(id)) {
      return NextResponse.json({ error: 'Valid notification id is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_user_id', auth.userId)
      .eq('is_read', false);

    if (!markAll) query = query.eq('id', id);
    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ message: markAll ? 'All notifications marked as read' : 'Notification marked as read' });
  } catch (error) {
    console.error('Update notification error:', error);
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 });
  }
}
