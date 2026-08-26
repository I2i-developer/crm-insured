'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { HEALTH_INSURANCE_COMPANIES, HEALTH_POLICY_TYPE, POLICY_TYPES } from '@/lib/healthPolicy';
import { POLICY_DISCOUNT_TYPES, POLICY_RENEWAL_YEARS, POLICY_STATUSES } from '@/lib/validation';
import { useToast } from '@/components/ToastProvider';
import styles from '../../new/page.module.css';

const OTHER_COMPANY = 'Other';

export default function EditPolicyPage() {
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [documentFile, setDocumentFile] = useState(null);
  const [currentDocument, setCurrentDocument] = useState({ name: '', url: '' });
  const [form, setForm] = useState({
    client_name: '',
    policy_bucket: 'renewal',
    policy_type: HEALTH_POLICY_TYPE,
    insurance_company: '',
    other_company: '',
    policy_number: '',
    plan_name: '',
    premium_amount: '',
    sum_insured: '',
    renewal_years: '1',
    discount_type: '',
    deductible_applicable: 'false',
    deductible_amount: '',
    due_date: '',
    payment_due_date: '',
    issuance_date: '',
    phone: '',
    email: '',
    status: 'Pending'
  });

  useEffect(() => {
    fetchPolicy();
  }, []);

  const fetchPolicy = async () => {
    try {
      const data = await api.get(`/policies/${params.id}`);
      const policy = data.policy;
      const knownCompany = HEALTH_INSURANCE_COMPANIES.includes(policy.insurance_company);
      setForm({
        client_name: policy.client_name,
        policy_bucket: policy.policy_bucket || 'renewal',
        policy_type: policy.policy_type || HEALTH_POLICY_TYPE,
        insurance_company: knownCompany ? policy.insurance_company : OTHER_COMPANY,
        other_company: knownCompany ? '' : policy.insurance_company,
        policy_number: policy.policy_number,
        plan_name: policy.plan_name || '',
        premium_amount: policy.premium_amount,
        sum_insured: policy.sum_insured ?? '',
        renewal_years: String(policy.renewal_years || 1),
        discount_type: policy.discount_type || '',
        deductible_applicable: policy.deductible_applicable ? 'true' : 'false',
        deductible_amount: policy.deductible_amount ?? '',
        due_date: policy.due_date,
        payment_due_date: policy.payment_due_date || '',
        issuance_date: policy.issuance_date,
        phone: policy.phone || '',
        email: policy.email || '',
        status: policy.status
      });
      setCurrentDocument({
        name: policy.epolicy_pdf_name || '',
        url: policy.epolicy_pdf_signed_url || ''
      });
    } catch (err) {
      setError('Failed to load policy');
      toast.error('Failed to load policy.');
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setDocumentFile(null);
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      const message = 'Please upload a PDF e-policy document.';
      setError(message);
      toast.error(message);
      e.target.value = '';
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      const message = 'E-policy PDF must be 8MB or smaller.';
      setError(message);
      toast.error(message);
      e.target.value = '';
      return;
    }

    setDocumentFile(file);
  };

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
    setSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        insurance_company: form.insurance_company === OTHER_COMPANY ? form.other_company : form.insurance_company,
        premium_amount: parseFloat(form.premium_amount),
        sum_insured: form.sum_insured === '' ? null : parseFloat(form.sum_insured),
        renewal_years: Number(form.renewal_years || 1),
        discount_type: form.discount_type || null,
        deductible_applicable: form.deductible_applicable === 'true',
        deductible_amount: form.deductible_applicable === 'true' && form.deductible_amount !== '' ? parseFloat(form.deductible_amount) : null
      };
      delete payload.other_company;

      await api.put(`/policies/${params.id}`, payload);
      let uploadedDocument = false;
      if (documentFile) {
        try {
          const documentData = new FormData();
          documentData.append('document', documentFile);
          await api.upload(`/policies/${params.id}/document`, documentData);
          uploadedDocument = true;
        } catch (uploadError) {
          toast.warning(uploadError.message || 'Policy was updated, but the e-policy PDF could not be uploaded.');
        }
      }

      toast.success(uploadedDocument ? 'Policy and e-policy PDF updated successfully.' : 'Policy updated successfully.');
      router.push(payload.policy_bucket === 'fresh' ? '/fresh-policies' : '/policies');
    } catch (err) {
      const message = err.message || 'Failed to update policy';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.form} style={{ textAlign: 'center', padding: '60px' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Edit Policy</h1>
        <p>Update policy details</p>
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
            />
          </div>

          <div className={styles.field}>
            <label>Policy Section</label>
            <select name="policy_bucket" value={form.policy_bucket} onChange={handleChange}>
              <option value="fresh">Fresh Policy</option>
              <option value="renewal">Policy to be Renewed</option>
            </select>
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
            <label>Policy Type</label>
            <select name="policy_type" value={form.policy_type} onChange={handleChange}>
              {POLICY_TYPES.map(type => <option key={type.name} value={type.name}>{type.name}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label>Policy Number *</label>
            <input
              type="text"
              name="policy_number"
              value={form.policy_number}
              onChange={handleChange}
              required
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
            <label>Premium Amount *</label>
            <input
              type="number"
              name="premium_amount"
              value={form.premium_amount}
              onChange={handleChange}
              required
              min="0"
              step="0.01"
            />
          </div>

          <div className={styles.field}>
            <label>{form.policy_type === 'Motor Insurance' ? 'IDV' : 'Sum Insured'}</label>
            <input
              type="number"
              name="sum_insured"
              value={form.sum_insured}
              onChange={handleChange}
              min="0"
              step="0.01"
            />
          </div>

          {form.policy_type !== 'Travel Insurance' && (
            <div className={styles.field}>
              <label>Renewal Paid For</label>
              <select name="renewal_years" value={form.renewal_years} onChange={handleChange}>
                {POLICY_RENEWAL_YEARS.map(year => <option key={year} value={year}>{year} year{year > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          )}

          <div className={styles.field}>
            <label>Discount</label>
            <select name="discount_type" value={form.discount_type} onChange={handleChange}>
              <option value="">No discount</option>
              {POLICY_DISCOUNT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label>Deductible</label>
            <select name="deductible_applicable" value={form.deductible_applicable} onChange={handleChange}>
              <option value="false">Not Applicable</option>
              <option value="true">Applicable</option>
            </select>
          </div>

          {form.deductible_applicable === 'true' && (
            <div className={styles.field}>
              <label>Deductible Amount *</label>
              <input
                type="number"
                name="deductible_amount"
                value={form.deductible_amount}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
              />
            </div>
          )}

          <div className={styles.field}>
            <label>{form.policy_type === 'Travel Insurance' ? 'Policy Expiry Date *' : 'Renewal / Due Date *'}</label>
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
            <label>Payment Due Date</label>
            <input
              type="date"
              name="payment_due_date"
              value={form.payment_due_date}
              onChange={handleChange}
            />
          </div>

          <div className={styles.field}>
            <label>Phone</label>
            <input
              type="tel"
              name="phone"
              value={form.phone}
              onChange={handleChange}
            />
          </div>

          <div className={styles.field}>
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
            />
          </div>

          <div className={styles.field}>
            <label>Status</label>
            <select name="status" value={form.status} onChange={handleChange}>
              {POLICY_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className={styles.field}>
            <label>E-policy PDF</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleDocumentChange}
            />
            <small>
              {currentDocument.name ? (
                <>
                  Current file: {currentDocument.url ? <a href={currentDocument.url} target="_blank" rel="noreferrer">{currentDocument.name}</a> : currentDocument.name}. Upload a new PDF to replace it.
                </>
              ) : 'Optional PDF upload, maximum 8MB.'}
            </small>
          </div>
        </div>

        <div className={styles.formActions}>
          <button type="button" onClick={() => router.back()} className={styles.cancelBtn}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={styles.submitBtn}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
