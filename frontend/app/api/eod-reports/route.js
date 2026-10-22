import { NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
  canReviewEodReports,
  canSubmitEodReport,
  getUserAccessFromRequest
} from '@/lib/server-auth';
import { cleanString } from '@/lib/validation';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_STATUSES = new Set(['submitted', 'reviewed', 'needs_changes']);

function dateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? value : '';
}

function nonNegativeInteger(value, field, errors) {
  const number = Number(value ?? 0);
  if (!Number.isInteger(number) || number < 0 || number > 100000) {
    errors.push(`${field} must be a non-negative whole number`);
    return 0;
  }
  return number;
}

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export async function GET(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = cleanString(searchParams.get('status'), 30);
    const dateFrom = dateOnly(searchParams.get('date_from'));
    const dateTo = dateOnly(searchParams.get('date_to'));
    const userId = cleanString(searchParams.get('user_id'), 80);
    const supabaseAdmin = getSupabaseAdmin();

    let query = supabaseAdmin
      .from('eod_reports')
      .select(`
        *,
        submitter:users!eod_reports_user_id_fkey(id, name, email, role, reports_to),
        reviewer:users!eod_reports_reviewed_by_fkey(id, name, email)
      `)
      .order('report_date', { ascending: false })
      .order('submitted_at', { ascending: false })
      .limit(250);

    const canReview = canReviewEodReports(auth.role);
    if (!canReview) query = query.eq('user_id', auth.userId);
    if (status && REPORT_STATUSES.has(status)) query = query.eq('status', status);
    if (dateFrom) query = query.gte('report_date', dateFrom);
    if (dateTo) query = query.lte('report_date', dateTo);
    if (userId && UUID_PATTERN.test(userId)) {
      if (canReview || userId === auth.userId) query = query.eq('user_id', userId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ reports: data || [] });
  } catch (error) {
    console.error('Get EOD reports error:', error);
    return NextResponse.json({ error: 'Failed to fetch EOD reports' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canSubmitEodReport(auth.role)) {
      return NextResponse.json({ error: 'Only Team Heads and Team Members submit EOD reports' }, { status: 403 });
    }

    const input = await request.json();
    const reportDate = dateOnly(input.report_date);
    const workSummary = cleanString(input.work_summary, 5000);
    const achievements = cleanString(input.achievements, 3000);
    const challenges = cleanString(input.challenges, 3000);
    const nextDayPlan = cleanString(input.next_day_plan, 3000);
    const errors = [];
    const leadsContacted = nonNegativeInteger(input.leads_contacted, 'Leads contacted', errors);
    const policiesClosed = nonNegativeInteger(input.policies_closed, 'Policies closed', errors);
    const renewalsCompleted = nonNegativeInteger(input.renewals_completed, 'Renewals completed', errors);

    if (!reportDate) errors.push('Report date is required');
    if (reportDate && reportDate > todayInIndia()) errors.push('EOD report date cannot be in the future');
    if (!workSummary) errors.push('Work summary is required');
    if (!nextDayPlan) errors.push('Next working-day plan is required');
    if (errors.length) return NextResponse.json({ error: errors.join(', ') }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing } = await supabaseAdmin
      .from('eod_reports')
      .select('id, status')
      .eq('user_id', auth.userId)
      .eq('report_date', reportDate)
      .maybeSingle();

    if (existing?.status === 'reviewed') {
      return NextResponse.json({ error: 'This EOD report has already been reviewed and is locked' }, { status: 409 });
    }

    const report = {
      user_id: auth.userId,
      submitter_name: auth.name || auth.email || 'CRM User',
      submitter_email: auth.email,
      role_at_submission: auth.role,
      report_date: reportDate,
      work_summary: workSummary,
      achievements: achievements || null,
      challenges: challenges || null,
      next_day_plan: nextDayPlan,
      leads_contacted: leadsContacted,
      policies_closed: policiesClosed,
      renewals_completed: renewalsCompleted,
      status: 'submitted',
      reviewed_by: null,
      reviewer_notes: null,
      reviewed_at: null,
      submitted_at: new Date().toISOString()
    };

    const operation = existing
      ? supabaseAdmin.from('eod_reports').update(report).eq('id', existing.id)
      : supabaseAdmin.from('eod_reports').insert(report);
    const { data, error } = await operation.select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await supabaseAdmin
      .from('user_notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_user_id', auth.userId)
      .eq('notification_type', 'eod_changes_requested')
      .eq('entity_id', data.id);

    const { data: admins, error: adminError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('role', 'admin');
    if (adminError) throw adminError;

    if ((admins || []).length > 0) {
      const notifications = admins.map(admin => ({
        recipient_user_id: admin.id,
        actor_user_id: auth.userId,
        notification_type: 'eod_submitted',
        title: existing ? 'EOD report resubmitted' : 'New EOD report submitted',
        message: `${auth.name || auth.email || 'A team user'} submitted the EOD report for ${reportDate}.`,
        href: '/eod-reports',
        entity_id: data.id,
        is_read: false,
        read_at: null,
        created_at: new Date().toISOString()
      }));
      const { error: notificationError } = await supabaseAdmin
        .from('user_notifications')
        .upsert(notifications, { onConflict: 'recipient_user_id,notification_type,entity_id' });
      if (notificationError) throw notificationError;
    }

    await writeAuditLog(request, auth, {
      action: existing ? 'eod_report.resubmit' : 'eod_report.submit',
      entityType: 'eod_report',
      entityId: data.id,
      summary: `${existing ? 'Resubmitted' : 'Submitted'} EOD report for ${reportDate}`,
      metadata: { report_date: reportDate, status: data.status }
    });

    return NextResponse.json({
      message: existing ? 'EOD report resubmitted successfully' : 'EOD report submitted successfully',
      report: data
    }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error('Submit EOD report error:', error);
    return NextResponse.json({ error: 'Failed to submit EOD report' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const auth = await getUserAccessFromRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canReviewEodReports(auth.role)) {
      return NextResponse.json({ error: 'Only Admins can review EOD reports' }, { status: 403 });
    }

    const input = await request.json();
    const id = cleanString(input.id, 80);
    const status = cleanString(input.status, 30);
    const reviewerNotes = cleanString(input.reviewer_notes, 3000);

    if (!UUID_PATTERN.test(id) || !['reviewed', 'needs_changes'].includes(status)) {
      return NextResponse.json({ error: 'Valid report and review decision are required' }, { status: 400 });
    }
    if (status === 'needs_changes' && !reviewerNotes) {
      return NextResponse.json({ error: 'Review notes are required when changes are requested' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: currentReport, error: currentError } = await supabaseAdmin
      .from('eod_reports')
      .select('id, status, user_id, report_date, submitter_name')
      .eq('id', id)
      .single();

    if (currentError || !currentReport) {
      return NextResponse.json({ error: 'EOD report not found' }, { status: 404 });
    }
    if (currentReport.status === 'reviewed') {
      return NextResponse.json({ error: 'This EOD report has already been reviewed' }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from('eod_reports')
      .update({
        status,
        reviewer_notes: reviewerNotes || null,
        reviewed_by: auth.userId,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', id)
      .neq('status', 'reviewed')
      .select()
      .single();

    if (error || !data) return NextResponse.json({ error: error?.message || 'EOD report not found' }, { status: 400 });

    if (data.user_id) {
      const { error: notificationError } = await supabaseAdmin
        .from('user_notifications')
        .upsert({
          recipient_user_id: data.user_id,
          actor_user_id: auth.userId,
          notification_type: status === 'reviewed' ? 'eod_reviewed' : 'eod_changes_requested',
          title: status === 'reviewed' ? 'EOD report reviewed' : 'EOD report needs changes',
          message: status === 'reviewed'
            ? `Your EOD report for ${data.report_date} was reviewed by an Admin.`
            : `An Admin requested changes to your EOD report for ${data.report_date}.`,
          href: '/eod-reports',
          entity_id: data.id,
          is_read: false,
          read_at: null,
          created_at: new Date().toISOString()
        }, { onConflict: 'recipient_user_id,notification_type,entity_id' });
      if (notificationError) throw notificationError;
    }

    await writeAuditLog(request, auth, {
      action: status === 'reviewed' ? 'eod_report.approve' : 'eod_report.request_changes',
      entityType: 'eod_report',
      entityId: data.id,
      summary: `${status === 'reviewed' ? 'Reviewed' : 'Requested changes to'} EOD report for ${data.report_date}`,
      metadata: { report_date: data.report_date, submitter_user_id: data.user_id, status }
    });

    return NextResponse.json({ message: status === 'reviewed' ? 'EOD report marked as reviewed' : 'Changes requested from submitter', report: data });
  } catch (error) {
    console.error('Review EOD report error:', error);
    return NextResponse.json({ error: 'Failed to review EOD report' }, { status: 500 });
  }
}
