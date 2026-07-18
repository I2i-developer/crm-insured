'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { HEALTH_INSURANCE_COMPANIES, HEALTH_POLICY_TYPE } from '@/lib/healthPolicy';
import { POLICY_DISCOUNT_TYPES, POLICY_RENEWAL_YEARS } from '@/lib/validation';
import { useToast } from '@/components/ToastProvider';
import styles from '../new/page.module.css';

const OTHER_COMPANY = 'Other';

export default function NewClientPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    client_name: '',
    policy_type: HEALTH_POLICY_TYPE,
    insurance_company: '',
    other_company: '',
    policy_number: '',
    plan_name: '',
    premium_amount: '',
    sum_insured: '',
    renewal_years: '1',
    discount_type: '',
    due_date: '',
    issuance_date: '',
    phone: '',
    email: '',
    status: 'Pending'
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'insurance_company' && value !== OTHER_COMPANY ? { other_company: '' } : {})
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = {
        ...form,
        insurance_company: form.insurance_company === OTHER_COMPANY ? form.other_company : form.insurance_company,
        premium_amount: parseFloat(form.premium_amount),
        sum_insured: form.sum_insured === '' ? null : parseFloat(form.sum_insured),
        renewal_years: Number(form.renewal_years || 1),
        discount_type: form.discount_type || null
      };
      delete payload.other_company;

      await api.post('/policies', payload);
      toast.success('Client and health policy created successfully.');
      router.push('/policies');
    } catch (err) {
      const message = err.message || 'Failed to create client policy';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Add New Client</h1>
        <p>Create a new client with their policy details</p>
      </header>

      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.errorMsg}>{error}</div>}

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Client Name *</label>
            <input
              type="text"
              name="client_name"
              value={form.client_name}
              onChange={handleChange}
              required
              placeholder="Enter client full name"
            />
          </div>

          <div className={styles.field}>
            <label>Insurance Company *</label>
            <select name="insurance_company" value={form.insurance_company} onChange={handleChange} required>
              <option value="">Select company</option>
              {HEALTH_INSURANCE_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {form.insurance_company === OTHER_COMPANY && (
            <div className={styles.field}>
              <label>Specify Company *</label>
              <input
                type="text"
                name="other_company"
                value={form.other_company}
                onChange={handleChange}
                required
                placeholder="Enter company name"
              />
            </div>
          )}

          <div className={styles.field}>
            <label>Policy Number *</label>
            <input
              type="text"
              name="policy_number"
              value={form.policy_number}
              onChange={handleChange}
              required
              placeholder="e.g., LIC/2024/001"
            />
          </div>

          <div className={styles.field}>
            <label>Plan Name</label>
            <input
              type="text"
              name="plan_name"
              value={form.plan_name}
              onChange={handleChange}
              placeholder="e.g., ReAssure 2.0 Titanium"
            />
          </div>

          <div className={styles.field}>
            <label>Premium Amount (INR) *</label>
            <input
              type="number"
              name="premium_amount"
              value={form.premium_amount}
              onChange={handleChange}
              required
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <div className={styles.field}>
            <label>Sum Insured (INR)</label>
            <input
              type="number"
              name="sum_insured"
              value={form.sum_insured}
              onChange={handleChange}
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>

          <div className={styles.field}>
            <label>Renewal Paid For</label>
            <select name="renewal_years" value={form.renewal_years} onChange={handleChange}>
              {POLICY_RENEWAL_YEARS.map(year => <option key={year} value={year}>{year} year{year > 1 ? 's' : ''}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label>Discount</label>
            <select name="discount_type" value={form.discount_type} onChange={handleChange}>
              <option value="">No discount</option>
              {POLICY_DISCOUNT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label>Due Date *</label>
            <input
              type="date"
              name="due_date"
              value={form.due_date}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.field}>
            <label>Issuance Date *</label>
            <input
              type="date"
              name="issuance_date"
              value={form.issuance_date}
              onChange={handleChange}
              required
            />
          </div>

          <div className={styles.field}>
            <label>Phone</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="client@email.com"
            />
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>
            Cancel
          </button>
          <button type="submit" disabled={loading} className={styles.submitBtn}>
            {loading ? 'Creating...' : 'Create Client'}
          </button>
        </div>
      </form>
    </div>
  );
}
