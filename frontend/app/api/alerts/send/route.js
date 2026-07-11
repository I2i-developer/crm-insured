import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/sendgrid';
import { sendSMS, sendWhatsApp } from '@/lib/twilio';
import { getUserIdFromRequest } from '@/lib/server-auth';
import { ALERT_CHANNELS, ALERT_TYPES, cleanString } from '@/lib/validation';

export async function POST(request) {
  try {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { policy_id, channel, type, message } = await request.json();

    if (!policy_id || !channel || !type) {
      return NextResponse.json({ error: 'policy_id, channel, and type are required' }, { status: 400 });
    }

    if (!ALERT_CHANNELS.includes(channel)) {
      return NextResponse.json({ error: 'Invalid channel' }, { status: 400 });
    }

    if (!ALERT_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: policy } = await supabaseAdmin
      .from('policies')
      .select('*')
      .eq('id', policy_id)
      .eq('user_id', userId)
      .single();

    if (!policy) {
      return NextResponse.json({ error: 'Policy not found' }, { status: 404 });
    }

    const defaultMessage = type === 'reminder'
      ? `Reminder: Your policy ${policy.policy_number} is due on ${policy.due_date}. Please ensure timely payment.`
      : type === 'overdue'
      ? `Alert: Your policy ${policy.policy_number} is overdue. Please make payment immediately.`
      : cleanString(message, 1000) || 'Please contact us regarding your policy.';

    let result;

    switch (channel) {
      case 'email':
        if (!policy.email) {
          return NextResponse.json({ error: 'Policy has no email address' }, { status: 400 });
        }
        result = await sendEmail(policy.email, `Policy ${policy.policy_number} - ${type}`, defaultMessage);
        break;
      case 'sms':
        if (!policy.phone) {
          return NextResponse.json({ error: 'Policy has no phone number' }, { status: 400 });
        }
        result = await sendSMS(policy.phone, defaultMessage);
        break;
      case 'whatsapp':
        if (!policy.phone) {
          return NextResponse.json({ error: 'Policy has no phone number' }, { status: 400 });
        }
        result = await sendWhatsApp(policy.phone, defaultMessage);
        break;
    }

    await supabaseAdmin
      .from('interaction_logs')
      .insert({
        policy_id,
        user_id: userId,
        remark: `Sent ${type} alert via ${channel}: ${defaultMessage}`
      });

    return NextResponse.json({
      message: `Alert sent successfully via ${channel}`,
      result,
      policy
    });
  } catch (error) {
    console.error('Send alert error:', error);
    return NextResponse.json({ error: 'Failed to send alert' }, { status: 500 });
  }
}
