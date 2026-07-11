import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';
import { validatePolicyInput } from '@/lib/validation';

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const search = searchParams.get('search') || '';
    const company = searchParams.get('company') || '';
    const status = searchParams.get('status') || '';
    const due_date_from = searchParams.get('due_date_from') || '';
    const due_date_to = searchParams.get('due_date_to') || '';
    const sort_by = searchParams.get('sort_by') || 'due_date';
    const sort_order = searchParams.get('sort_order') || 'asc';

    const supabaseAdmin = getSupabaseAdmin();
    let queryBuilder = supabaseAdmin
      .from('policies')
      .select('*', { count: 'exact' });

    if (!isPrivilegedRole(auth.role)) {
      queryBuilder = queryBuilder.eq('user_id', auth.userId);
    }

    if (search) {
      queryBuilder = queryBuilder.ilike('client_name', `%${search}%`);
    }

    if (company) {
      queryBuilder = queryBuilder.eq('insurance_company', company);
    }

    if (status) {
      queryBuilder = queryBuilder.eq('status', status);
    }

    if (due_date_from) {
      queryBuilder = queryBuilder.gte('due_date', due_date_from);
    }

    if (due_date_to) {
      queryBuilder = queryBuilder.lte('due_date', due_date_to);
    }

    const sortColumn = ['due_date', 'client_name', 'premium_amount', 'created_at'].includes(sort_by)
      ? sort_by
      : 'due_date';
    const ascending = sort_order === 'asc';

    queryBuilder = queryBuilder.order(sortColumn, { ascending });

    const offset = (page - 1) * limit;
    queryBuilder = queryBuilder.range(offset, offset + limit - 1);

    const { data, error, count } = await queryBuilder;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      policies: data,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    console.error('Get policies error:', error);
    return NextResponse.json({ error: 'Failed to fetch policies' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { policy, errors } = validatePolicyInput(await request.json());
    if (errors.length) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('policies')
      .insert({
        ...policy,
        user_id: auth.userId
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Policy number already exists' }, { status: 400 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'policy.create',
      entityType: 'policy',
      entityId: data.id,
      summary: `Created policy ${data.policy_number} for ${data.client_name}`,
      metadata: { policy_number: data.policy_number, client_name: data.client_name }
    });

    return NextResponse.json({ message: 'Policy created successfully', policy: data }, { status: 201 });
  } catch (error) {
    console.error('Create policy error:', error);
    return NextResponse.json({ error: 'Failed to create policy' }, { status: 500 });
  }
}
