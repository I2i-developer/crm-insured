'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { HEALTH_POLICY_TYPE } from '@/lib/healthPolicy';
import { useToast } from '@/components/ToastProvider';
import styles from './policy-report.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getPolicyPaymentDate(policy) {
  return policy.payment_due_date || policy.due_date;
}

function statusClass(status) {
  return styles[`badge${String(status || '').replace(/\s+/g, '')}`] || '';
}

function isPolicyClosed(policy) {
  return policy.status === 'Paid' || policy.status === 'Renew Done';
}

function getClientInitial(name) {
  const cleaned = String(name || '')
    .replace(/^\s*(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, '')
    .trim();
  return (cleaned.charAt(0) || 'C').toUpperCase();
}

export default function PolicyReportPage({
  title,
  description,
  mode = 'all',
  status = '',
  daysAhead = 30
}) {
  const toast = useToast();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [company, setCompany] = useState('');
  const [range, setRange] = useState(daysAhead);

  const query = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const params = new URLSearchParams({
      page: '1',
      limit: '1000',
      sort_by: mode === 'paymentDue' || mode === 'upcomingPayment' ? 'payment_due_date' : 'due_date',
      sort_order: 'asc'
    });

    if (search) params.set('search', search);
    if (company) params.set('company', company);
    if (status) params.set('status', status);

    if (mode === 'expired') {
      params.set('due_date_to', toDateInput(new Date(today.getTime() - DAY_MS)));
    }

    if (mode === 'upcomingExpiry') {
      params.set('due_date_from', toDateInput(today));
      params.set('due_date_to', toDateInput(new Date(today.getTime() + Number(range) * DAY_MS)));
    }

    return params.toString();
  }, [company, mode, range, search, status]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    api.get(`/policies?${query}`)
      .then(data => {
        if (!active) return;
        setPolicies(data.policies || []);
      })
      .catch(error => {
        console.error('Failed to load report:', error);
        toast.error('Failed to load policy report.');
        if (active) setPolicies([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, toast]);

  const filteredPolicies = useMemo(() => {
    const today = startOfToday();
    const rangeEnd = new Date(today.getTime() + Number(range) * DAY_MS);

    if (mode === 'paymentDue') {
      return policies.filter(policy => {
        if (isPolicyClosed(policy)) return false;
        const paymentDate = new Date(getPolicyPaymentDate(policy));
        return !Number.isNaN(paymentDate.getTime()) && paymentDate < today;
      });
    }

    if (mode === 'upcomingPayment') {
      return policies.filter(policy => {
        if (isPolicyClosed(policy)) return false;
        const paymentDate = new Date(getPolicyPaymentDate(policy));
        return !Number.isNaN(paymentDate.getTime()) && paymentDate >= today && paymentDate <= rangeEnd;
      });
    }

    if (!['expired', 'upcomingExpiry'].includes(mode)) return policies;
    return policies.filter(policy => !isPolicyClosed(policy));
  }, [mode, policies, range]);

  const companies = useMemo(() => {
    return [...new Set(policies.map(policy => policy.insurance_company).filter(Boolean))].sort();
  }, [policies]);

  const totalPremium = filteredPolicies.reduce((sum, policy) => sum + Number(policy.premium_amount || 0), 0);
  const pendingCount = filteredPolicies.filter(policy => policy.status === 'Pending').length;
  const urgentCount = filteredPolicies.filter(policy => {
    const due = new Date(mode === 'paymentDue' || mode === 'upcomingPayment' ? getPolicyPaymentDate(policy) : policy.due_date);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return due <= new Date(now.getTime() + 7 * DAY_MS);
  }).length;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className={styles.actions}>
          <Link href="/policies/new" className={styles.primaryBtn}>New Policy</Link>
          <Link href="/policies/import" className={styles.secondaryBtn}>Import</Link>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Policies</span>
          <span className={styles.statValue}>{loading ? '-' : filteredPolicies.length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pending</span>
          <span className={styles.statValue}>{loading ? '-' : pendingCount}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Urgent Window</span>
          <span className={styles.statValue}>{loading ? '-' : urgentCount}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Premium Value</span>
          <span className={styles.statValue}>{loading ? '-' : formatCurrency(totalPremium)}</span>
        </div>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Filters</h2>
        <div className={styles.filters}>
          <input className={styles.input} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search client name" />
          <select className={styles.select} value={company} onChange={event => setCompany(event.target.value)}>
            <option value="">All companies</option>
            {companies.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          {(mode === 'upcomingExpiry' || mode === 'upcomingPayment') && (
            <select className={styles.select} value={range} onChange={event => setRange(event.target.value)}>
              <option value="7">Next 7 days</option>
              <option value="15">Next 15 days</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
            </select>
          )}
        </div>
      </section>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.loading}>Loading policies...</div>
        ) : filteredPolicies.length === 0 ? (
          <div className={styles.empty}>No matching policies found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Policy #</th>
                <th>Company</th>
                <th>Type</th>
                <th>{mode === 'paymentDue' || mode === 'upcomingPayment' ? 'Payment Due' : 'Due Date'}</th>
                <th>Premium</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPolicies.map(policy => (
                <tr key={policy.id}>
                  <td>
                    <div className={styles.clientCell}>
                      <div className={styles.avatar}>{getClientInitial(policy.client_name)}</div>
                      <span>{policy.client_name}</span>
                    </div>
                  </td>
                  <td className={styles.muted}>{policy.policy_number}</td>
                  <td>{policy.insurance_company}</td>
                  <td>{policy.policy_type || HEALTH_POLICY_TYPE}</td>
                  <td>{formatDate(mode === 'paymentDue' || mode === 'upcomingPayment' ? getPolicyPaymentDate(policy) : policy.due_date)}</td>
                  <td className={styles.amount}>{formatCurrency(policy.premium_amount)}</td>
                  <td><span className={`${styles.badge} ${statusClass(policy.status)}`}>{policy.status}</span></td>
                  <td><Link className={`${styles.secondaryBtn} ${styles.iconBtn}`} href={`/policies/${policy.id}`} title="Open policy details" aria-label="Open policy details"><OpenIcon /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
