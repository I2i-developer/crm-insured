export const POLICY_STATUSES = ['Paid', 'Pending', 'Overdue', 'Grace Period', 'Lapsed', 'Renew Done'];
export const POLICY_RENEWAL_YEARS = [1, 2, 3];
export const POLICY_DISCOUNT_TYPES = ['NRI discount', 'Family discount'];
export const ALERT_CHANNELS = ['email', 'sms', 'whatsapp'];
export const ALERT_TYPES = ['reminder', 'overdue', 'custom'];
export const DEFAULT_POLICY_TYPE = 'Health Insurance';
export const LEAD_STAGES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Converted', 'Lost'];
export const LEAD_PRIORITIES = ['Low', 'Medium', 'High'];

export function cleanString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseSpreadsheetDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isValidDateString(trimmed)) return trimmed;
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }

  return null;
}

function parseAmount(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : Number.NaN;
  }
  return Number(value);
}

export function validatePolicyInput(input, { partial = false } = {}) {
  const errors = [];
  const policy = {};

  const required = ['client_name', 'insurance_company', 'policy_number', 'premium_amount', 'due_date', 'issuance_date'];
  if (!partial) {
    for (const field of required) {
      if (input[field] === undefined || input[field] === null || input[field] === '') {
        errors.push(`${field} is required`);
      }
    }
  }

  if (input.client_name !== undefined) policy.client_name = cleanString(input.client_name, 160);
  if (input.policy_type !== undefined) policy.policy_type = cleanString(input.policy_type, 120) || DEFAULT_POLICY_TYPE;
  if (input.insurance_company !== undefined) policy.insurance_company = cleanString(input.insurance_company, 160);
  if (input.policy_number !== undefined) policy.policy_number = cleanString(String(input.policy_number), 80);
  if (input.plan_name !== undefined) policy.plan_name = cleanString(input.plan_name, 160) || null;

  if (input.renewal_years !== undefined) {
    const years = Number(input.renewal_years);
    if (!POLICY_RENEWAL_YEARS.includes(years)) {
      errors.push('renewal_years must be 1, 2, or 3');
    } else {
      policy.renewal_years = years;
    }
  } else if (!partial) {
    policy.renewal_years = 1;
  }

  if (input.premium_amount !== undefined) {
    const amount = parseAmount(input.premium_amount);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push('premium_amount must be a non-negative number');
    } else {
      policy.premium_amount = amount;
    }
  }

  const sumInsuredInput = input.sum_insured !== undefined ? input.sum_insured : input.sun_insured;
  if (sumInsuredInput !== undefined) {
    if (sumInsuredInput === null || sumInsuredInput === '') {
      policy.sum_insured = null;
    } else {
      const amount = parseAmount(sumInsuredInput);
      if (!Number.isFinite(amount) || amount < 0) {
        errors.push('sum_insured must be a non-negative number');
      } else {
        policy.sum_insured = amount;
      }
    }
  }

  for (const field of ['due_date', 'issuance_date', 'payment_due_date']) {
    if (input[field] !== undefined) {
      if (field === 'payment_due_date' && (input[field] === null || input[field] === '')) {
        policy[field] = null;
        continue;
      }
      const parsed = parseSpreadsheetDate(input[field]);
      if (!parsed) errors.push(`${field} must be a valid date`);
      else policy[field] = parsed;
    }
  }

  if (input.phone !== undefined) policy.phone = cleanString(input.phone, 40) || null;
  if (input.email !== undefined) {
    const email = cleanString(input.email, 254) || null;
    if (!isValidEmail(email)) errors.push('email must be valid');
    policy.email = email;
  }

  if (input.status !== undefined && input.status !== null && String(input.status).trim() !== '') {
    if (!POLICY_STATUSES.includes(input.status)) errors.push('status is invalid');
    else policy.status = input.status;
  } else if (!partial) {
    policy.status = 'Pending';
  }

  if (input.discount_type !== undefined) {
    const discountType = cleanString(input.discount_type, 80);
    if (!discountType) {
      policy.discount_type = null;
    } else if (!POLICY_DISCOUNT_TYPES.includes(discountType)) {
      errors.push('discount_type is invalid');
    } else {
      policy.discount_type = discountType;
    }
  }

  if (!partial && !policy.policy_type) {
    policy.policy_type = DEFAULT_POLICY_TYPE;
  }

  return { policy, errors };
}

export function validateLeadInput(input, { partial = false } = {}) {
  const errors = [];
  const lead = {};

  if (!partial && !cleanString(input.client_name, 160)) {
    errors.push('client_name is required');
  }

  if (input.client_name !== undefined) lead.client_name = cleanString(input.client_name, 160);
  if (input.phone !== undefined) lead.phone = cleanString(input.phone, 40) || null;
  if (input.email !== undefined) {
    const email = cleanString(input.email, 254) || null;
    if (!isValidEmail(email)) errors.push('email must be valid');
    lead.email = email;
  }
  if (input.source !== undefined) lead.source = cleanString(input.source, 80) || null;
  if (input.notes !== undefined) lead.notes = cleanString(input.notes, 1000) || null;
  if (input.assigned_to !== undefined) lead.assigned_to = cleanString(input.assigned_to, 80) || null;

  if (input.stage !== undefined) {
    if (!LEAD_STAGES.includes(input.stage)) errors.push('stage is invalid');
    else lead.stage = input.stage;
  } else if (!partial) {
    lead.stage = 'New';
  }

  if (input.priority !== undefined) {
    if (!LEAD_PRIORITIES.includes(input.priority)) errors.push('priority is invalid');
    else lead.priority = input.priority;
  } else if (!partial) {
    lead.priority = 'Medium';
  }

  if (input.expected_premium !== undefined) {
    const amount = Number(input.expected_premium || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push('expected_premium must be a non-negative number');
    } else {
      lead.expected_premium = amount;
    }
  } else if (!partial) {
    lead.expected_premium = 0;
  }

  if (input.next_follow_up !== undefined) {
    if (input.next_follow_up === null || input.next_follow_up === '') {
      lead.next_follow_up = null;
    } else {
      const parsed = parseSpreadsheetDate(input.next_follow_up);
      if (!parsed) errors.push('next_follow_up must be a valid date');
      else lead.next_follow_up = parsed;
    }
  }

  return { lead, errors };
}

export function validateLeadRemarkInput(input) {
  const remark = cleanString(input.remark, 800);
  return {
    remark,
    errors: remark ? [] : ['remark is required']
  };
}
