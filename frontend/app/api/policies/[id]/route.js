import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';
import { validatePolicyInput } from '@/lib/validation';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidPolicyId(id) {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}

function invalidPolicyIdResponse() {
  return NextResponse.json({ error: 'Invalid policy id' }, { status: 400 });
}

async function getPolicyId(params) {
  const resolvedParams = await params;
  return resolvedParams?.id;
}

export async function GET(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = await getPolicyId(params);
    if (!isValidPolicyId(id)) {
      return invalidPolicyIdResponse();
    }

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('policies')
      .select('*')
      .eq('id', id);

    if (!isPrivilegedRole(auth.role)) {
      query = query.eq('user_id', auth.userId);
    }

    const { data, error } = await query.single();

    if (error) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    return NextResponse.json({ policy: data });
  } catch (error) {
    console.error('Get policy error:', error);
    return NextResponse.json({ error: 'Failed to fetch policy' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = await getPolicyId(params);
    if (!isValidPolicyId(id)) {
      return invalidPolicyIdResponse();
    }

    const { policy: updates, errors } = validatePolicyInput(await request.json(), { partial: true });
    if (errors.length) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('policies')
      .update(updates)
      .eq('id', id);

    if (!isPrivilegedRole(auth.role)) {
      query = query.eq('user_id', auth.userId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'policy.update',
      entityType: 'policy',
      entityId: data.id,
      summary: `Updated policy ${data.policy_number} for ${data.client_name}`,
      metadata: { updates: Object.keys(updates), policy_number: data.policy_number }
    });

    return NextResponse.json({ message: 'Policy updated successfully', policy: data });
  } catch (error) {
    console.error('Update policy error:', error);
    return NextResponse.json({ error: 'Failed to update policy' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const id = await getPolicyId(params);
    if (!isValidPolicyId(id)) {
      return invalidPolicyIdResponse();
    }

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from('policies')
      .delete()
      .eq('id', id);

    if (!isPrivilegedRole(auth.role)) {
      query = query.eq('user_id', auth.userId);
    }

    const { data, error } = await query.select('id, policy_number, client_name').single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await writeAuditLog(request, auth, {
      action: 'policy.delete',
      entityType: 'policy',
      entityId: data.id,
      summary: `Deleted policy ${data.policy_number} for ${data.client_name}`,
      metadata: { policy_number: data.policy_number, client_name: data.client_name }
    });

    return NextResponse.json({ message: 'Policy deleted successfully' });
  } catch (error) {
    console.error('Delete policy error:', error);
    return NextResponse.json({ error: 'Failed to delete policy' }, { status: 500 });
  }
}
