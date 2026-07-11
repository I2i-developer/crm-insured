import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';
import { validateLeadRemarkInput } from '@/lib/validation';

function applyLeadAccess(query, auth) {
  if (isPrivilegedRole(auth.role)) return query;
  return query.or(`user_id.eq.${auth.userId},assigned_to.eq.${auth.userId}`);
}

export async function POST(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const { remark, errors } = validateLeadRemarkInput(await request.json());
    if (errors.length) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let leadQuery = supabaseAdmin
      .from('leads')
      .select('id')
      .eq('id', id);
    leadQuery = applyLeadAccess(leadQuery, auth);

    const { data: lead, error: leadError } = await leadQuery.single();
    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    const { count, error: countError } = await supabaseAdmin
      .from('lead_remarks')
      .select('id', { count: 'exact', head: true })
      .eq('lead_id', id);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 400 });
    }

    if ((count || 0) >= 5) {
      return NextResponse.json({ error: 'A lead can have a maximum of 5 remarks' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('lead_remarks')
      .insert({
        lead_id: id,
        user_id: auth.userId,
        remark
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'lead.remark.create',
      entityType: 'lead',
      entityId: id,
      summary: 'Added lead remark',
      metadata: { remark_id: data.id }
    });

    return NextResponse.json({ message: 'Remark added successfully', remark: data }, { status: 201 });
  } catch (error) {
    console.error('Create lead remark error:', error);
    return NextResponse.json({ error: 'Failed to add remark' }, { status: 500 });
  }
}
