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

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get('search') || '').replace(/[,%()]/g, ' ').trim();
    const stage = searchParams.get('stage') || '';
    const priority = searchParams.get('priority') || '';

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('leads')
      .select('*, lead_remarks(id, user_id, remark, created_at)', { count: 'exact' });

    query = applyLeadAccess(query, auth);

    if (search) {
      query = query.or(`client_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    }

    if (stage) query = query.eq('stage', stage);
    if (priority) query = query.eq('priority', priority);

    const { data, error, count } = await query.order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      leads: (data || []).map(sortLeadRemarks),
      count: count || 0
    });
  } catch (error) {
    console.error('Get leads error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { lead, errors } = validateLeadInput(await request.json());
    if (errors.length) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('leads')
      .insert({
        ...lead,
        user_id: auth.userId,
        assigned_to: lead.assigned_to || auth.userId
      })
      .select('*, lead_remarks(id, user_id, remark, created_at)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'lead.create',
      entityType: 'lead',
      entityId: data.id,
      summary: `Created lead ${data.client_name}`,
      metadata: { client_name: data.client_name, stage: data.stage, priority: data.priority }
    });

    return NextResponse.json({ message: 'Lead created successfully', lead: sortLeadRemarks(data) }, { status: 201 });
  } catch (error) {
    console.error('Create lead error:', error);
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}
