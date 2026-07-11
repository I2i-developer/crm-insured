import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';
import { cleanString } from '@/lib/validation';

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get('policy');

    const supabaseAdmin = getSupabaseAdmin();
    let queryBuilder = supabaseAdmin
      .from('interaction_logs')
      .select('*, policies!inner(user_id)');

    if (!isPrivilegedRole(auth.role)) {
      queryBuilder = queryBuilder.eq('policies.user_id', auth.userId);
    }

    if (policyId) {
      queryBuilder = queryBuilder.eq('policy_id', policyId);
    }

    queryBuilder = queryBuilder.order('created_at', { ascending: false });

    const { data, error } = await queryBuilder;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ logs: data });
  } catch (error) {
    console.error('Get interaction logs error:', error);
    return NextResponse.json({ error: 'Failed to fetch interaction logs' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { policy_id, remark } = await request.json();
    const cleanRemark = cleanString(remark, 2000);

    if (!policy_id || !cleanRemark) {
      return NextResponse.json({ error: 'policy_id and remark are required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let policyQuery = supabaseAdmin
      .from('policies')
      .select('id')
      .eq('id', policy_id);

    if (!isPrivilegedRole(auth.role)) {
      policyQuery = policyQuery.eq('user_id', auth.userId);
    }

    const { data: policy } = await policyQuery.single();

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('interaction_logs')
      .insert({ policy_id, user_id: auth.userId, remark: cleanRemark })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'interaction.create',
      entityType: 'interaction',
      entityId: data.id,
      summary: 'Created policy interaction log',
      metadata: { policy_id }
    });

    return NextResponse.json({ message: 'Interaction log created', log: data }, { status: 201 });
  } catch (error) {
    console.error('Create interaction log error:', error);
    return NextResponse.json({ error: 'Failed to create interaction log' }, { status: 500 });
  }
}
