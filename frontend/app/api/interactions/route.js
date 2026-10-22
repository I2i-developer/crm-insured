import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { applyUserAccessScope, getAccessibleUserIds, getUserAccessFromRequest } from '@/lib/server-auth';
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
      .select('*');

    const accessibleUserIds = await getAccessibleUserIds(auth, supabaseAdmin);
    if (accessibleUserIds) {
      const inList = `(${accessibleUserIds.join(',')})`;
      const { data: accessiblePolicies, error: policyAccessError } = await supabaseAdmin
        .from('policies')
        .select('id')
        .or(`user_id.in.${inList},assigned_to.in.${inList}`);

      if (policyAccessError) return NextResponse.json({ error: policyAccessError.message }, { status: 400 });
      const policyIds = (accessiblePolicies || []).map(policy => policy.id);
      if (policyIds.length === 0) return NextResponse.json({ logs: [] });
      queryBuilder = queryBuilder.in('policy_id', policyIds);
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

    ({ query: policyQuery } = await applyUserAccessScope(policyQuery, auth, 'user_id', supabaseAdmin, ['assigned_to']));

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
