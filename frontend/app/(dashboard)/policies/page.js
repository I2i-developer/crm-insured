'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { HEALTH_INSURANCE_COMPANIES, HEALTH_POLICY_TYPE } from '@/lib/healthPolicy';
import { POLICY_STATUSES } from '@/lib/validation';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidPolicyId(id) {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}

function getClientInitial(name) {
  const cleaned = String(name || '')
    .replace(/^\s*(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, '')
    .trim();
  return (cleaned.charAt(0) || 'C').toUpperCase();
}

export default function PoliciesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendingRenewals: 0, paid: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });

  const [filters, setFilters] = useState({
    search: searchParams.get('search') || '',
    company: searchParams.get('company') || '',
    status: searchParams.get('filter') || '',
    due_date_from: '',
    due_date_to: ''
  });

  useEffect(() => {
    fetchStats();
    fetchPolicies();
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [filters, pagination.page]);

  const fetchStats = async () => {
    try {
      const data = await api.get('/policies/stats');
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      toast.error('Failed to load policy stats.');
    }
  };

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: pagination.limit,
        ...filters
      });
      const data = await api.get(`/policies?${params.toString()}`);
      setPolicies(data.policies);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Failed to fetch policies:', error);
      toast.error('Failed to load policies.');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleDelete = async (id) => {
    const confirmed = await toast.confirm({
      title: 'Delete policy?',
      message: 'This will permanently remove the policy and its interaction history.',
      confirmLabel: 'Delete'
    });
    if (!confirmed) return;

    try {
      await api.delete(`/policies/${id}`);
      toast.success('Policy deleted successfully.');
      fetchPolicies();
      fetchStats();
    } catch (error) {
      toast.error(error.message || 'Failed to delete policy.');
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    if (!isValidPolicyId(id)) {
      toast.error('This policy record is missing a valid id. Refresh the page and try again.');
      fetchPolicies();
      return;
    }

    try {
      await api.put(`/policies/${id}`, { status: newStatus });
      toast.success(`Policy marked as ${newStatus}.`);
      fetchPolicies();
      fetchStats();
    } catch (error) {
      toast.error(error.message || 'Failed to update status.');
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const getStatusClass = (status) => {
    const map = {
      'Paid': styles.badgePaid,
      'Pending': styles.badgePending,
      'Overdue': styles.badgeOverdue,
      'Grace Period': styles.badgeGrace,
      'Lapsed': styles.badgeLapsed,
      'Renew Done': styles.badgeRenewDone
    };
    return map[status] || '';
  };

  const getDaysUntilDue = (date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(date);
    due.setHours(0, 0, 0, 0);
    return Math.ceil((due - today) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Policies</h1>
          <p>Manage your client policies and track renewals</p>
        </div>
        <div className={styles.headerActions}>
          <Link href="/policies/import" className={styles.importBtn}>Import</Link>
          <Link href="/policies/new" className={styles.addBtn}>+ Add Policy</Link>
        </div>
      </header>

      <div className={styles.statsRow}>
        <div className={styles.statBento}>
          <div className={styles.statIcon}><TotalIcon /></div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{loading ? '-' : stats.total}</span>
            <span className={styles.statLabel}>Total Policies</span>
          </div>
        </div>
        <div className={styles.statBento}>
          <div className={`${styles.statIcon} ${styles.pendingIcon}`}><PendingIcon /></div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{loading ? '-' : stats.pendingRenewals}</span>
            <span className={styles.statLabel}>Pending Renewals</span>
          </div>
        </div>
        <div className={styles.statBento}>
          <div className={`${styles.statIcon} ${styles.paidIcon}`}><PaidIcon /></div>
          <div className={styles.statInfo}>
            <span className={styles.statValue}>{loading ? '-' : stats.paid}</span>
            <span className={styles.statLabel}>Paid</span>
          </div>
        </div>
      </div>

      <div className={styles.filtersCard}>
        <div className={styles.filters}>
          <input
            type="text"
            placeholder="Search by client name..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className={styles.searchInput}
          />
          <select value={filters.company} onChange={(e) => handleFilterChange('company', e.target.value)} className={styles.select}>
            <option value="">All Companies</option>
            {HEALTH_INSURANCE_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filters.status} onChange={(e) => handleFilterChange('status', e.target.value)} className={styles.select}>
            <option value="">All Statuses</option>
            {POLICY_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
          </select>
          <input
            type="date"
            value={filters.due_date_from}
            onChange={(e) => handleFilterChange('due_date_from', e.target.value)}
            className={styles.dateInput}
          />
          <input
            type="date"
            value={filters.due_date_to}
            onChange={(e) => handleFilterChange('due_date_to', e.target.value)}
            className={styles.dateInput}
          />
        </div>
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.loadingState}>Loading...</div>
        ) : policies.length === 0 ? (
          <div className={styles.emptyState}>
            <EmptyIcon />
            <p>No policies found</p>
            <Link href="/policies/new" className={styles.emptyAddBtn}>Add your first policy</Link>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Policy #</th>
                  <th>Type</th>
                  <th>Company</th>
                  <th>Due Date</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map(policy => {
                  const days = getDaysUntilDue(policy.due_date);
                  const hasValidId = isValidPolicyId(policy.id);
                  return (
                    <tr key={policy.id || `${policy.policy_number}-${policy.client_name}`}>
                      <td>
                        <div className={styles.clientCell}>
                          <div className={styles.avatar}>{getClientInitial(policy.client_name)}</div>
                          <span>{policy.client_name}</span>
                        </div>
                      </td>
                      <td className={styles.policyNumber}>{policy.policy_number}</td>
                      <td>{policy.policy_type || HEALTH_POLICY_TYPE}</td>
                      <td>{policy.insurance_company}</td>
                      <td>
                        <span className={days <= 7 ? styles.urgent : days <= 30 ? styles.soon : ''}>
                          {formatDate(policy.due_date)}
                        </span>
                        {days > 0 && days <= 7 && <small className={styles.daysLabel}>in {days}d</small>}
                        {days < 0 && <small className={styles.overdueLabel}>Overdue</small>}
                      </td>
                      <td className={styles.amount}>{formatCurrency(policy.premium_amount)}</td>
                      <td>
                        <select
                          value={policy.status}
                          onChange={(e) => handleStatusChange(policy.id, e.target.value)}
                          disabled={!hasValidId}
                          className={`${styles.statusSelect} ${getStatusClass(policy.status)}`}
                          title={hasValidId ? 'Update policy status' : 'Policy id is missing'}
                        >
                          {POLICY_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                      <td>
                        <div className={styles.actionBtns}>
                          {hasValidId ? (
                            <>
                              <Link href={`/policies/${policy.id}`} className={styles.editBtn} title="View policy" aria-label="View policy"><ViewIcon /></Link>
                              <Link href={`/policies/edit/${policy.id}`} className={styles.editBtn} title="Edit policy" aria-label="Edit policy"><EditIcon /></Link>
                              <Link href={`/interactions?policy=${policy.id}`} className={styles.logBtn} title="Policy remarks and logs" aria-label="Policy remarks and logs"><LogsIcon /></Link>
                              <button type="button" onClick={() => handleDelete(policy.id)} className={styles.deleteBtn} title="Delete policy" aria-label="Delete policy"><DeleteIcon /></button>
                            </>
                          ) : (
                            <span className={styles.invalidRecord}>Missing ID</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className={styles.pagination}>
              <span>Page {pagination.page} of {pagination.totalPages || 1}</span>
              <div className={styles.pageBtns}>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  disabled={pagination.page <= 1}
                  className={styles.pageBtn}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  disabled={pagination.page >= pagination.totalPages}
                  className={styles.pageBtn}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const TotalIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
  </svg>
);

const PendingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
);

const PaidIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22,4 12,14.01 9,11.01"/>
  </svg>
);

const EmptyIcon = () => (
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="12" y1="12" x2="12" y2="18"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
  </svg>
);

const ViewIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
  </svg>
);

const LogsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>
    <path d="M8 9h8M8 13h5"/>
  </svg>
);

const DeleteIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18"/>
    <path d="M8 6V4h8v2"/>
    <path d="M19 6l-1 15H6L5 6"/>
    <path d="M10 11v6M14 11v6"/>
  </svg>
);
