'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { HEALTH_POLICY_TYPE } from '@/lib/healthPolicy';
import { POLICY_DISCOUNT_TYPES, POLICY_STATUSES } from '@/lib/validation';
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

function getPolicyDateByType(policy, type) {
  if (type === 'issuance') return policy.issuance_date;
  if (type === 'payment') return getPolicyPaymentDate(policy);
  return policy.due_date;
}

function parseFilterAmount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

function isDateWithinRange(value, from, to) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return false;

  if (from) {
    const start = new Date(`${from}T00:00:00`);
    if (!Number.isNaN(start.getTime()) && date < start) return false;
  }

  if (to) {
    const end = new Date(`${to}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && date > end) return false;
  }

  return true;
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
  const [advancedFilters, setAdvancedFilters] = useState({
    status: '',
    policyNumber: '',
    planName: '',
    discountType: '',
    dateType: 'due',
    dateFrom: '',
    dateTo: '',
    premiumFrom: '',
    premiumTo: '',
    sumInsuredFrom: '',
    sumInsuredTo: ''
  });
  const showAdvancedFilters = mode === 'all';

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
    if (status || advancedFilters.status) params.set('status', status || advancedFilters.status);

    if (mode === 'expired') {
      params.set('due_date_to', toDateInput(new Date(today.getTime() - DAY_MS)));
    }

    if (mode === 'upcomingExpiry') {
      params.set('due_date_from', toDateInput(today));
      params.set('due_date_to', toDateInput(new Date(today.getTime() + Number(range) * DAY_MS)));
    }

    return params.toString();
  }, [advancedFilters.status, company, mode, range, search, status]);

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

    const basePolicies = !['expired', 'upcomingExpiry'].includes(mode)
      ? policies
      : policies.filter(policy => !isPolicyClosed(policy));

    if (!showAdvancedFilters) return basePolicies;

    const premiumFrom = parseFilterAmount(advancedFilters.premiumFrom);
    const premiumTo = parseFilterAmount(advancedFilters.premiumTo);
    const sumInsuredFrom = parseFilterAmount(advancedFilters.sumInsuredFrom);
    const sumInsuredTo = parseFilterAmount(advancedFilters.sumInsuredTo);
    const policyNumber = advancedFilters.policyNumber.trim().toLowerCase();
    const planName = advancedFilters.planName.trim().toLowerCase();

    return basePolicies.filter(policy => {
      if (policyNumber && !String(policy.policy_number || '').toLowerCase().includes(policyNumber)) return false;
      if (planName && !String(policy.plan_name || '').toLowerCase().includes(planName)) return false;
      if (advancedFilters.discountType) {
        const discount = policy.discount_type || 'none';
        if (advancedFilters.discountType !== discount) return false;
      }
      if (advancedFilters.dateFrom || advancedFilters.dateTo) {
        if (!isDateWithinRange(getPolicyDateByType(policy, advancedFilters.dateType), advancedFilters.dateFrom, advancedFilters.dateTo)) {
          return false;
        }
      }

      const premium = Number(policy.premium_amount || 0);
      if (premiumFrom !== null && premium < premiumFrom) return false;
      if (premiumTo !== null && premium > premiumTo) return false;

      const sumInsured = policy.sum_insured === null || policy.sum_insured === undefined ? null : Number(policy.sum_insured);
      if (sumInsuredFrom !== null && (sumInsured === null || sumInsured < sumInsuredFrom)) return false;
      if (sumInsuredTo !== null && (sumInsured === null || sumInsured > sumInsuredTo)) return false;

      return true;
    });
  }, [advancedFilters, mode, policies, range, showAdvancedFilters]);

  const companies = useMemo(() => {
    return [...new Set(policies.map(policy => policy.insurance_company).filter(Boolean))].sort();
  }, [policies]);

  const clearAdvancedFilters = () => {
    setAdvancedFilters({
      status: '',
      policyNumber: '',
      planName: '',
      discountType: '',
      dateType: 'due',
      dateFrom: '',
      dateTo: '',
      premiumFrom: '',
      premiumTo: '',
      sumInsuredFrom: '',
      sumInsuredTo: ''
    });
  };

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
          {showAdvancedFilters && !status && (
            <select className={styles.select} value={advancedFilters.status} onChange={event => setAdvancedFilters(prev => ({ ...prev, status: event.target.value }))}>
              <option value="">All statuses</option>
              {POLICY_STATUSES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          )}
          {(mode === 'upcomingExpiry' || mode === 'upcomingPayment') && (
            <select className={styles.select} value={range} onChange={event => setRange(event.target.value)}>
              <option value="7">Next 7 days</option>
              <option value="15">Next 15 days</option>
              <option value="30">Next 30 days</option>
              <option value="60">Next 60 days</option>
            </select>
          )}
        </div>
        {showAdvancedFilters && (
          <div className={styles.advancedFilters}>
            <input
              className={styles.input}
              value={advancedFilters.policyNumber}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, policyNumber: event.target.value }))}
              placeholder="Policy number"
            />
            <input
              className={styles.input}
              value={advancedFilters.planName}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, planName: event.target.value }))}
              placeholder="Plan name"
            />
            <select className={styles.select} value={advancedFilters.discountType} onChange={event => setAdvancedFilters(prev => ({ ...prev, discountType: event.target.value }))}>
              <option value="">All discounts</option>
              <option value="none">No discount</option>
              {POLICY_DISCOUNT_TYPES.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select className={styles.select} value={advancedFilters.dateType} onChange={event => setAdvancedFilters(prev => ({ ...prev, dateType: event.target.value }))}>
              <option value="due">Due date</option>
              <option value="issuance">Issuance date</option>
              <option value="payment">Payment due date</option>
            </select>
            <input
              className={styles.input}
              type="date"
              value={advancedFilters.dateFrom}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, dateFrom: event.target.value }))}
              aria-label="Date from"
            />
            <input
              className={styles.input}
              type="date"
              value={advancedFilters.dateTo}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, dateTo: event.target.value }))}
              aria-label="Date to"
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              value={advancedFilters.premiumFrom}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, premiumFrom: event.target.value }))}
              placeholder="Premium min"
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              value={advancedFilters.premiumTo}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, premiumTo: event.target.value }))}
              placeholder="Premium max"
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              value={advancedFilters.sumInsuredFrom}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, sumInsuredFrom: event.target.value }))}
              placeholder="Sum insured min"
            />
            <input
              className={styles.input}
              type="number"
              min="0"
              value={advancedFilters.sumInsuredTo}
              onChange={event => setAdvancedFilters(prev => ({ ...prev, sumInsuredTo: event.target.value }))}
              placeholder="Sum insured max"
            />
            <button type="button" className={styles.clearFiltersBtn} onClick={clearAdvancedFilters}>
              Clear filters
            </button>
          </div>
        )}
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
