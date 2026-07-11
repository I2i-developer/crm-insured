import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/sendgrid';
import { sendSMS, sendWhatsApp } from '@/lib/twilio';

const getDaysUntilDue = (dueDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffTime = due.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const shouldSendReminder = (policy) => {
  const daysUntilDue = getDaysUntilDue(policy.due_date);
  return daysUntilDue === 30 && policy.status === 'Pending';
};

const shouldSendOverdueAlert = (policy) => {
  const isOverdue = new Date(policy.due_date) < new Date() && policy.status !== 'Paid';
  const lastAlertSent = policy.last_alert_sent_at
    ? new Date(policy.last_alert_sent_at)
    : new Date(policy.due_date);

  const daysSinceLastAlert = Math.floor(
    (new Date() - lastAlertSent) / (1000 * 60 * 60 * 24)
  );

  return isOverdue && daysSinceLastAlert >= 3;
};

const sendRenewalReminder = async (policy) => {
  const daysUntilDue = getDaysUntilDue(policy.due_date);
  const reminderMessage = `Reminder: Your policy ${policy.policy_number} with ${policy.insurance_company} is due in ${daysUntilDue} days (${policy.due_date}). Premium amount: $${policy.premium_amount}. Please ensure timely payment to avoid lapse.`;

  const results = { email: null, sms: null, whatsapp: null };

  if (policy.email) {
    try {
      results.email = await sendEmail(
        policy.email,
        `Policy Renewal Reminder - ${policy.policy_number}`,
        reminderMessage
      );
    } catch (err) {
      console.error(`Email error for policy ${policy.id}:`, err);
    }
  }

  if (policy.phone) {
    try {
      results.sms = await sendSMS(policy.phone, reminderMessage);
    } catch (err) {
      console.error(`SMS error for policy ${policy.id}:`, err);
    }

    try {
      results.whatsapp = await sendWhatsApp(policy.phone, reminderMessage);
    } catch (err) {
      console.error(`WhatsApp error for policy ${policy.id}:`, err);
    }
  }

  return results;
};

const sendOverdueAlert = async (policy) => {
  const overdueDays = Math.abs(getDaysUntilDue(policy.due_date));
  const alertMessage = `URGENT: Your policy ${policy.policy_number} with ${policy.insurance_company} is overdue by ${overdueDays} days. Please make payment immediately to avoid policy lapse. Contact your agent for payment options.`;

  const results = { email: null, sms: null, whatsapp: null };

  if (policy.email) {
    try {
      results.email = await sendEmail(
        policy.email,
        `OVERDUE: Policy ${policy.policy_number}`,
        alertMessage
      );
    } catch (err) {
      console.error(`Email error for policy ${policy.id}:`, err);
    }
  }

  if (policy.phone) {
    try {
      results.sms = await sendSMS(policy.phone, alertMessage);
    } catch (err) {
      console.error(`SMS error for policy ${policy.id}:`, err);
    }

    try {
      results.whatsapp = await sendWhatsApp(policy.phone, alertMessage);
    } catch (err) {
      console.error(`WhatsApp error for policy ${policy.id}:`, err);
    }
  }

  return results;
};

export async function GET(request) {
  try {
    const cronSecret = request.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || cronSecret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized cron request' }, { status: 401 });
    }

    console.log(`[${new Date().toISOString()}] Starting daily renewal check...`);

    const supabaseAdmin = getSupabaseAdmin();
    const { data: policies, error } = await supabaseAdmin
      .from('policies')
      .select('*')
      .neq('status', 'Paid');

    if (error) {
      console.error('Failed to fetch policies for cron:', error);
      return NextResponse.json({ error: 'Failed to fetch policies' }, { status: 500 });
    }

    console.log(`Found ${policies.length} policies to check`);

    let reminderCount = 0;
    let overdueCount = 0;

    for (const policy of policies) {
      try {
        if (shouldSendReminder(policy)) {
          console.log(`Sending T-30 reminder for policy ${policy.policy_number}`);
          await sendRenewalReminder(policy);
          reminderCount++;

          await supabaseAdmin
            .from('interaction_logs')
            .insert({
              policy_id: policy.id,
              user_id: policy.user_id,
              remark: `T-30 reminder sent automatically via cron job`
            });
        }

        if (shouldSendOverdueAlert(policy)) {
          console.log(`Sending overdue alert for policy ${policy.policy_number}`);
          await sendOverdueAlert(policy);
          overdueCount++;

          await supabaseAdmin
            .from('policies')
            .update({ last_alert_sent_at: new Date().toISOString() })
            .eq('id', policy.id);

          await supabaseAdmin
            .from('interaction_logs')
            .insert({
              policy_id: policy.id,
              user_id: policy.user_id,
              remark: `Overdue alert sent automatically via cron job`
            });
        }
      } catch (err) {
        console.error(`Error processing policy ${policy.id}:`, err);
      }
    }

    console.log(`Daily renewal check completed:`);
    console.log(`  - Reminders sent: ${reminderCount}`);
    console.log(`  - Overdue alerts sent: ${overdueCount}`);

    return NextResponse.json({
      message: 'Cron job completed',
      remindersSent: reminderCount,
      overdueAlertsSent: overdueCount,
      totalPoliciesChecked: policies.length
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Cron job failed' }, { status: 500 });
  }
}
