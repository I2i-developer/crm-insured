import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isSuperAdminRole } from '@/lib/server-auth';

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isSuperAdminRole(auth.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await writeAuditLog(request, auth, {
      action: 'audit.view',
      entityType: 'audit_log',
      entityId: null,
      summary: 'Viewed audit logs',
      metadata: {}
    });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit')) || 100, 250);
    const action = searchParams.get('action') || '';
    const entityType = searchParams.get('entity_type') || '';

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (action) query = query.eq('action', action);
    if (entityType) query = query.eq('entity_type', entityType);

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ auditLogs: data || [] });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch audit logs' }, { status: 500 });
  }
}
