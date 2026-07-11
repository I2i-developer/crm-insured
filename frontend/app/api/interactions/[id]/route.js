import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';
import { cleanString } from '@/lib/validation';

export async function PUT(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const { remark } = await request.json();
    const cleanRemark = cleanString(remark, 2000);

    if (!cleanRemark) {
      return NextResponse.json({ error: 'Remark is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('interaction_logs')
      .update({ remark: cleanRemark })
      .eq('id', id);

    if (!isPrivilegedRole(auth.role)) {
      query = query.eq('user_id', auth.userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'interaction.update',
      entityType: 'interaction',
      entityId: data.id,
      summary: 'Updated policy interaction log',
      metadata: { policy_id: data.policy_id }
    });

    return NextResponse.json({ message: 'Interaction log updated', log: data });
  } catch (error) {
    console.error('Update interaction log error:', error);
    return NextResponse.json({ error: 'Failed to update interaction log' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('interaction_logs')
      .delete()
      .eq('id', id);

    if (!isPrivilegedRole(auth.role)) {
      query = query.eq('user_id', auth.userId);
    }

    const { data, error } = await query.select('id, policy_id').single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'interaction.delete',
      entityType: 'interaction',
      entityId: data.id,
      summary: 'Deleted policy interaction log',
      metadata: { policy_id: data.policy_id }
    });

    return NextResponse.json({ message: 'Interaction log deleted successfully' });
  } catch (error) {
    console.error('Delete interaction log error:', error);
    return NextResponse.json({ error: 'Failed to delete interaction log' }, { status: 500 });
  }
}
