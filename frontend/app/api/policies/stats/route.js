import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getUserAccessFromRequest, isPrivilegedRole } from '@/lib/server-auth';

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const baseCount = () => {
      let query = supabaseAdmin
        .from('policies')
        .select('id', { count: 'exact', head: true });

      if (!isPrivilegedRole(auth.role)) {
        query = query.eq('user_id', auth.userId);
      }

      return query;
    };

    const { count: totalCount } = await baseCount();
    const { count: pendingCount } = await baseCount()
      .eq('status', 'Pending');

    const { count: paidCount } = await baseCount()
      .eq('status', 'Paid');

    const { count: overdueCount } = await baseCount()
      .eq('status', 'Overdue');

    const { count: gracePeriodCount } = await baseCount()
      .eq('status', 'Grace Period');

    const { count: lapsedCount } = await baseCount()
      .eq('status', 'Lapsed');

    return NextResponse.json({
      stats: {
        total: totalCount || 0,
        pendingRenewals: pendingCount || 0,
        paid: paidCount || 0,
        overdue: overdueCount || 0,
        gracePeriod: gracePeriodCount || 0,
        lapsed: lapsedCount || 0
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
