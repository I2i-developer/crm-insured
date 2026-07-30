'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function getDaysUntil(value) {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(value);
  due.setHours(0, 0, 0, 0);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due - today) / DAY_MS);
}

function getClientInitial(name) {
  const cleaned = String(name || '')
    .replace(/^\s*(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, '')
    .trim();
  return (cleaned.charAt(0) || 'C').toUpperCase();
}

function statusClass(status) {
  return styles[`status${String(status || '').replace(/\s+/g, '')}`] || '';
}

export default function PolicyDetailsPage() {
  const { id } = useParams();
  const router = useRouter();
  const toast = useToast();
  const [policy, setPolicy] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingLogId, setEditingLogId] = useState(null);
  const [editingRemark, setEditingRemark] = useState('');
  const [updatingRemark, setUpdatingRemark] = useState(false);

  const fetchDetails = async () => {
    setLoading(true);
    try {
      const [policyData, logData] = await Promise.all([
        api.get(`/policies/${id}`),
        api.get(`/interactions?policy=${id}`)
      ]);
      setPolicy(policyData.policy);
      setLogs(logData.logs || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load policy details.');
      router.push('/policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetails();
  }, [id]);

  const renewalDays = useMemo(() => getDaysUntil(policy?.due_date), [policy]);
  const paymentDays = useMemo(() => getDaysUntil(policy?.payment_due_date || policy?.due_date), [policy]);

  const renewalLabel = renewalDays === null
    ? 'No renewal date'
    : renewalDays < 0
    ? `${Math.abs(renewalDays)} days overdue`
    : renewalDays === 0
    ? 'Due today'
    : `Due in ${renewalDays} days`;

  const paymentLabel = paymentDays === null
    ? 'No payment date'
    : paymentDays < 0
    ? `${Math.abs(paymentDays)} days overdue`
    : paymentDays === 0
    ? 'Due today'
    : `Due in ${paymentDays} days`;

  const handleAddRemark = async (event) => {
    event.preventDefault();
    if (!remark.trim()) return;

    setSubmitting(true);
    try {
      await api.post('/interactions', { policy_id: id, remark });
      setRemark('');
      toast.success('Remark added successfully.');
      const data = await api.get(`/interactions?policy=${id}`);
      setLogs(data.logs || []);
    } catch (error) {
      toast.error(error.message || 'Failed to add remark.');
    } finally {
      setSubmitting(false);
    }
  };

  const startEditingRemark = (log) => {
    setEditingLogId(log.id);
    setEditingRemark(log.remark || '');
  };

  const cancelEditingRemark = () => {
    setEditingLogId(null);
    setEditingRemark('');
  };

  const handleUpdateRemark = async (logId) => {
    if (!editingRemark.trim()) {
      toast.warning('Remark cannot be empty.');
      return;
    }

    setUpdatingRemark(true);
    try {
      const data = await api.put(`/interactions/${logId}`, { remark: editingRemark });
      setLogs(current => current.map(log => (log.id === logId ? data.log : log)));
      toast.success('Remark updated successfully.');
      cancelEditingRemark();
    } catch (error) {
      toast.error(error.message || 'Failed to update remark.');
    } finally {
      setUpdatingRemark(false);
    }
  };

  if (loading) {
    return <div className={styles.loading}>Loading policy details...</div>;
  }

  if (!policy) return null;

  const isTravelPolicy = policy.policy_type === 'Travel Insurance';
  const isMotorPolicy = policy.policy_type === 'Motor Insurance';
  const detailGroups = [
    {
      title: 'Policy Information',
      items: [
        ['Policy Number', policy.policy_number],
        ['Policy Type', policy.policy_type || 'Health Insurance'],
        ['Plan Name', policy.plan_name || '-'],
        ['Insurance Company', policy.insurance_company],
        ['Status', policy.status],
        ['Premium Amount', formatCurrency(policy.premium_amount)],
        [isMotorPolicy ? 'IDV' : 'Sum Insured', policy.sum_insured ? formatCurrency(policy.sum_insured) : '-'],
        ['Renewal Paid For', isTravelPolicy ? 'One-time travel policy' : `${policy.renewal_years || 1} year${Number(policy.renewal_years || 1) > 1 ? 's' : ''}`],
        ['Discount', policy.discount_type || 'No discount'],
        ['Deductible', policy.deductible_applicable ? formatCurrency(policy.deductible_amount) : 'Not Applicable']
      ]
    },
    {
      title: 'Client & Contact',
      items: [
        ['Client Name', policy.client_name],
        ['Phone', policy.phone || '-'],
        ['Email', policy.email || '-']
      ]
    },
    {
      title: 'Dates',
      items: [
        ['Issuance Date', formatDate(policy.issuance_date)],
        [isTravelPolicy ? 'Policy Expiry Date' : 'Renewal / Due Date', formatDate(policy.due_date)],
        ['Payment Due Date', formatDate(policy.payment_due_date || policy.due_date)],
        ['E-policy Uploaded', formatDateTime(policy.epolicy_pdf_uploaded_at)],
        ['Created', formatDateTime(policy.created_at)],
        ['Last Updated', formatDateTime(policy.updated_at)]
      ]
    }
  ];

  return (
    <div className={styles.container}>
      <header className={styles.hero}>
        <div className={styles.clientAvatar}>{getClientInitial(policy.client_name)}</div>
        <div>
          <span className={styles.eyebrow}>Policy Details</span>
          <h1>{policy.client_name}</h1>
          <p>{policy.policy_number} - {policy.insurance_company}</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/policies" className={styles.secondaryBtn}>Back</Link>
          <Link href={`/policies/edit/${policy.id}`} className={styles.primaryBtn}>Edit Policy</Link>
        </div>
      </header>

      <section className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <span>Status</span>
          <strong className={`${styles.statusPill} ${statusClass(policy.status)}`}>{policy.status}</strong>
        </div>
        <div className={styles.statusCard}>
          <span>Renewal</span>
          <strong>{renewalLabel}</strong>
        </div>
        <div className={styles.statusCard}>
          <span>Payment</span>
          <strong>{paymentLabel}</strong>
        </div>
        <div className={styles.statusCard}>
          <span>Premium</span>
          <strong>{formatCurrency(policy.premium_amount)}</strong>
        </div>
      </section>

      <section className={styles.detailGrid}>
        {detailGroups.map(group => (
          <div className={styles.panel} key={group.title}>
            <h2>{group.title}</h2>
            <div className={styles.detailList}>
              {group.items.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value || '-'}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className={styles.documentPanel}>
        <div className={styles.panel}>
          <h2>E-policy Document</h2>
          {policy.epolicy_pdf_signed_url ? (
            <a className={styles.documentLink} href={policy.epolicy_pdf_signed_url} target="_blank" rel="noreferrer">
              <DocumentIcon />
              <span>
                <strong>{policy.epolicy_pdf_name || 'View e-policy PDF'}</strong>
                <small>Signed link opens in a new tab</small>
              </span>
            </a>
          ) : (
            <div className={styles.empty}>No e-policy PDF uploaded yet.</div>
          )}
        </div>
      </section>

      <section className={styles.historyGrid}>
        <div className={styles.panel}>
          <h2>Policy History</h2>
          <div className={styles.timeline}>
            <div>
              <span></span>
              <strong>Policy created</strong>
              <small>{formatDateTime(policy.created_at)}</small>
            </div>
            <div>
              <span></span>
              <strong>Policy last updated</strong>
              <small>{formatDateTime(policy.updated_at)}</small>
            </div>
            <div>
              <span></span>
              <strong>Current status: {policy.status}</strong>
              <small>{renewalLabel}</small>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <h2>Remarks & Communication</h2>
          <form className={styles.remarkForm} onSubmit={handleAddRemark}>
            <textarea
              value={remark}
              onChange={event => setRemark(event.target.value)}
              placeholder="Add a client conversation, renewal note, payment update, or follow-up remark"
              maxLength={2000}
            />
            <button type="submit" disabled={submitting || !remark.trim()}>
              {submitting ? 'Adding...' : 'Add Remark'}
            </button>
          </form>

          {logs.length === 0 ? (
            <div className={styles.empty}>No remarks or communication history yet.</div>
          ) : (
            <div className={styles.logList}>
              {logs.map(log => (
                <article key={log.id} className={styles.logItem}>
                  {editingLogId === log.id ? (
                    <div className={styles.logEditForm}>
                      <textarea
                        value={editingRemark}
                        onChange={event => setEditingRemark(event.target.value)}
                        maxLength={2000}
                      />
                      <div className={styles.logActions}>
                        <button type="button" onClick={cancelEditingRemark} className={styles.secondarySmallBtn}>
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateRemark(log.id)}
                          className={styles.primarySmallBtn}
                          disabled={updatingRemark || !editingRemark.trim()}
                        >
                          {updatingRemark ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.logHeader}>
                        <time>{formatDateTime(log.created_at)}</time>
                        <button type="button" onClick={() => startEditingRemark(log)} title="Edit remark" aria-label="Edit remark">
                          <EditIcon />
                        </button>
                      </div>
                      <p>{log.remark}</p>
                    </>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6"/>
      <path d="M8 13h8M8 17h6"/>
    </svg>
  );
}
