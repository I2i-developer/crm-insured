import { getSupabaseAdmin } from '@/lib/supabase';

export async function writeAuditLog(request, auth, details) {
  try {
    if (!auth?.userId) return;

    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('audit_logs')
      .insert({
        actor_user_id: auth.userId,
        actor_email: auth.email || null,
        actor_role: auth.role || null,
        action: details.action,
        entity_type: details.entityType,
        entity_id: details.entityId ? String(details.entityId) : null,
        summary: details.summary,
        metadata: details.metadata || {},
        ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        user_agent: request.headers.get('user-agent') || null
      });
  } catch (error) {
    console.error('Audit log write failed:', error);
  }
}
