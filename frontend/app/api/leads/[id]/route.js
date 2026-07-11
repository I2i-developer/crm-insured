import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';
import { validateLeadInput } from '@/lib/validation';

function applyLeadAccess(query, auth) {
  if (isPrivilegedRole(auth.role)) return query;
  return query.or(`user_id.eq.${auth.userId},assigned_to.eq.${auth.userId}`);
}

function sortLeadRemarks(lead) {
  return {
    ...lead,
    lead_remarks: [...(lead.lead_remarks || [])].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    )
  };
}

export async function GET(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('leads')
      .select('*, lead_remarks(id, user_id, remark, created_at)')
      .eq('id', id);

    query = applyLeadAccess(query, auth);

    const { data, error } = await query.single();

    if (error) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json({ lead: sortLeadRemarks(data) });
  } catch (error) {
    console.error('Get lead error:', error);
    return NextResponse.json({ error: 'Failed to fetch lead' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const { lead: updates, errors } = validateLeadInput(await request.json(), { partial: true });
    if (errors.length) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('leads')
      .update(updates)
      .eq('id', id);

    query = applyLeadAccess(query, auth);

    const { data, error } = await query
      .select('*, lead_remarks(id, user_id, remark, created_at)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'lead.update',
      entityType: 'lead',
      entityId: data.id,
      summary: `Updated lead ${data.client_name}`,
      metadata: { updates: Object.keys(updates), stage: data.stage, priority: data.priority }
    });

    return NextResponse.json({ message: 'Lead updated successfully', lead: sortLeadRemarks(data) });
  } catch (error) {
    console.error('Update lead error:', error);
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
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
      .from('leads')
      .delete()
      .eq('id', id);

    query = applyLeadAccess(query, auth);

    const { data, error } = await query.select('id, client_name').single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'lead.delete',
      entityType: 'lead',
      entityId: data.id,
      summary: `Deleted lead ${data.client_name}`,
      metadata: { client_name: data.client_name }
    });

    return NextResponse.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 });
  }
}
