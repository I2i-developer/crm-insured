'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

const STATUS_ORDER = ['Paid', 'Renew Done', 'Pending', 'Overdue', 'Grace Period', 'Lapsed'];
const STATUS_COLORS = {
  Paid: '#16a34a',
  'Renew Done': '#2563eb',
  Pending: '#eab308',
  Overdue: '#ef4444',
  'Grace Period': '#0ea5b7',
  Lapsed: '#667085'
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = ['Paid', 'Renew Done'];

function getPolicyBusinessDate(policy) {
  const date = new Date(policy.issuance_date || policy.created_at || policy.due_date);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isInDateRange(policy, dateFrom, dateTo) {
  const date = getPolicyBusinessDate(policy);
  if (!date) return false;

  if (dateFrom) {
    const start = new Date(`${dateFrom}T00:00:00`);
    if (!Number.isNaN(start.getTime()) && date < start) return false;
  }

  if (dateTo) {
    const end = new Date(`${dateTo}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && date > end) return false;
  }

  return true;
}

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({ total: 0, pendingRenewals: 0, paid: 0, renewDone: 0, overdue: 0, gracePeriod: 0, lapsed: 0 });
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState('All');
  const [dashboardFilters, setDashboardFilters] = useState({ dateFrom: '', dateTo: '' });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    try {
      setUser(JSON.parse(userStr));
    } catch {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    try {
      const [statsData, policyData] = await Promise.all([
        api.get('/policies/stats'),
        api.get('/policies?page=1&limit=1000&sort_by=due_date&sort_order=asc')
      ]);
      setStats(statsData.stats);
      setPolicies(policyData.policies || []);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      toast.error('Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  };

  const filteredPolicies = useMemo(() => {
    if (!dashboardFilters.dateFrom && !dashboardFilters.dateTo) return policies;
    return policies.filter(policy => isInDateRange(policy, dashboardFilters.dateFrom, dashboardFilters.dateTo));
  }, [dashboardFilters, policies]);

  const metrics = useMemo(() => {
    const activePortfolioPolicies = filteredPolicies.filter(policy => policy.status !== 'Lapsed');
    const totalPremium = activePortfolioPolicies.reduce((sum, policy) => sum + Number(policy.premium_amount || 0), 0);
    const paidPremium = filteredPolicies
      .filter(policy => CLOSED_STATUSES.includes(policy.status))
      .reduce((sum, policy) => sum + Number(policy.premium_amount || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueInSeven = filteredPolicies.filter(policy => {
      const due = new Date(policy.due_date);
      return !CLOSED_STATUSES.includes(policy.status) && due >= today && due <= new Date(today.getTime() + 7 * DAY_MS);
    }).length;

    const overdueValue = filteredPolicies
      .filter(policy => !CLOSED_STATUSES.includes(policy.status) && policy.status !== 'Lapsed' && (policy.status === 'Overdue' || new Date(policy.due_date) < today))
      .reduce((sum, policy) => sum + Number(policy.premium_amount || 0), 0);

    const filteredCounts = filteredPolicies.reduce((counts, policy) => {
      counts.total += 1;
      counts[policy.status] = (counts[policy.status] || 0) + 1;
      return counts;
    }, { total: 0 });
    const closedCount = (filteredCounts.Paid || 0) + (filteredCounts['Renew Done'] || 0);
    const activeCount = activePortfolioPolicies.length;
    const paidRate = activeCount ? Math.round((closedCount / activeCount) * 100) : 0;
    const riskCount = (filteredCounts.Overdue || 0) + (filteredCounts['Grace Period'] || 0) + (filteredCounts.Lapsed || 0);

    return {
      totalPremium,
      paidPremium,
      dueInSeven,
      overdueValue,
      paidRate,
      riskCount,
      activeCount,
      portfolioCount: activePortfolioPolicies.length,
      counts: filteredCounts
    };
  }, [filteredPolicies]);

  const statusRows = STATUS_ORDER.map(status => {
    const count = metrics.counts?.[status] || 0;
    const percent = metrics.counts?.total ? Math.round((count / metrics.counts.total) * 100) : 0;
    const premium = filteredPolicies
      .filter(policy => policy.status === status)
      .reduce((sum, policy) => sum + Number(policy.premium_amount || 0), 0);
    return { status, count, percent, premium, color: STATUS_COLORS[status] };
  });
  const statusPanelRows = [
    { status: 'All', count: metrics.counts?.total || 0, percent: 100, premium: metrics.totalPremium, color: 'var(--primary)' },
    ...statusRows
  ];
  const visibleStatusRows = activeStatus === 'All' ? statusRows : statusRows.filter(row => row.status === activeStatus);

  const renewalBuckets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets = [
      { label: 'Overdue', min: -Infinity, max: -1, count: 0 },
      { label: '0-7 days', min: 0, max: 7, count: 0 },
      { label: '8-15 days', min: 8, max: 15, count: 0 },
      { label: '16-30 days', min: 16, max: 30, count: 0 },
      { label: '30+ days', min: 31, max: Infinity, count: 0 }
    ];

    filteredPolicies
      .filter(policy => !CLOSED_STATUSES.includes(policy.status))
      .forEach(policy => {
        const due = new Date(policy.due_date);
        due.setHours(0, 0, 0, 0);
        const days = Math.ceil((due - today) / DAY_MS);
        const bucket = buckets.find(item => days >= item.min && days <= item.max);
        if (bucket) bucket.count += 1;
      });

    const max = Math.max(1, ...buckets.map(bucket => bucket.count));
    return buckets.map(bucket => ({ ...bucket, percent: Math.round((bucket.count / max) * 100) }));
  }, [filteredPolicies]);

  if (!user) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount || 0);
  const currentHour = new Date().getHours();
  const greeting = currentHour < 12
    ? 'Good Morning'
    : currentHour < 17
    ? 'Good Afternoon'
    : 'Good Evening';
  const firstName = (user.name || 'User').trim().split(/\s+/)[0];
  const hasDashboardFilters = Boolean(dashboardFilters.dateFrom || dashboardFilters.dateTo);
  const roleView = {
    super_admin: {
      description: 'Full CRM governance view for testing, user access, audit tracking, and health policy operations.',
      eyebrow: 'System Summary',
      totalLabel: 'team health policies under management'
    },
    admin: {
      description: 'Team-head view for monitoring leads, renewals, payment risk, and agent follow-up priorities.',
      eyebrow: 'Team Summary',
      totalLabel: 'team health policies under management'
    },
    team_member: {
      description: 'Focused view of your assigned health policies, renewals, payment follow-ups, and action queue.',
      eyebrow: 'My Summary',
      totalLabel: 'health policies assigned to you'
    }
  }[user.role] || {
    description: 'Health policy portfolio summary, renewal risk, payment movement, and team action signals.',
    eyebrow: 'Executive Summary',
    totalLabel: 'health policies under management'
  };

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.greetingTitle}>
            <span>{greeting},</span>
            <strong>{firstName}</strong>
          </h1>
          <p className={styles.greetingCopy}>Welcome back.</p>
        </div>
        {/* <div className={styles.headerDate}>
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div> */}
      </header>

      <section className={styles.summaryPanel}>
        <div>
          <span className={styles.eyebrow}>{roleView.eyebrow}</span>
          <h2>{loading ? 'Loading portfolio...' : `${metrics.activeCount} ${roleView.totalLabel}`}</h2>
          <p>
            {metrics.riskCount > 0
              ? `${metrics.riskCount} policies need attention across overdue, grace, or lapsed stages.`
              : 'No high-risk policy stage is currently flagged.'}
          </p>
        </div>
        <div className={styles.summaryMetrics}>
          <span>Paid rate <strong>{loading ? '-' : `${metrics.paidRate}%`}</strong></span>
          <span>7-day renewals <strong>{loading ? '-' : metrics.dueInSeven}</strong></span>
          <span>At-risk value <strong>{loading ? '-' : formatCurrency(metrics.overdueValue)}</strong></span>
        </div>
      </section>

      <section className={styles.dashboardFilterPanel}>
        <div>
          <span className={styles.eyebrow}>Dashboard Filters</span>
          <h2>Card date range</h2>
        </div>
        <div className={styles.dashboardFilters}>
          <label>
            <span>From</span>
            <input
              type="date"
              value={dashboardFilters.dateFrom}
              onChange={event => setDashboardFilters(prev => ({ ...prev, dateFrom: event.target.value }))}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={dashboardFilters.dateTo}
              onChange={event => setDashboardFilters(prev => ({ ...prev, dateTo: event.target.value }))}
            />
          </label>
          <button
            type="button"
            onClick={() => setDashboardFilters({ dateFrom: '', dateTo: '' })}
            disabled={!hasDashboardFilters}
          >
            Clear
          </button>
        </div>
      </section>

      <div className={styles.statGrid}>
        <MetricCard
          icon={<PolicyTotalIcon />}
          label="Portfolio Value"
          value={loading ? '-' : formatCurrency(metrics.totalPremium)}
          hint={`${metrics.portfolioCount || 0} active records, lapsed excluded`}
          tone="primary"
        />
        <MetricCard icon={<PolicyPaidIcon />} label="Paid Premium" value={loading ? '-' : formatCurrency(metrics.paidPremium)} hint={`${metrics.paidRate}% collected in range`} tone="success" />
        <MetricCard icon={<PolicyPendingIcon />} label="Pending Renewals" value={loading ? '-' : (metrics.counts?.Pending || 0)} hint={`${metrics.dueInSeven} due in 7 days`} tone="warning" href="/upcoming-renewals" />
        <MetricCard icon={<PolicyOverdueIcon />} label="Risk Queue" value={loading ? '-' : metrics.riskCount} hint={formatCurrency(metrics.overdueValue)} tone="danger" href="/expired-policies" />
      </div>

      <div className={styles.graphGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><StatusIcon />Status Distribution</h2>
            <span>{metrics.counts?.total || 0} total</span>
          </div>
          <div className={styles.statusGraph}>
            {statusRows.map(row => (
              <button
                type="button"
                className={`${styles.statusRow} ${activeStatus === row.status ? styles.statusRowActive : ''}`}
                key={row.status}
                onClick={() => setActiveStatus(row.status)}
              >
                <div className={styles.statusMeta}>
                  <span>{row.status}</span>
                  <strong>{row.count}</strong>
                </div>
                <div className={styles.progressTrack}>
                  <span style={{ width: `${row.percent}%`, background: row.color }}></span>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><RenewalIcon />Renewal Timeline</h2>
            <span>Open policies</span>
          </div>
          <div className={styles.barGraph}>
            {renewalBuckets.map(bucket => (
              <div className={styles.barItem} key={bucket.label}>
                <div className={styles.barWrap}>
                  <span style={{ height: `${Math.max(8, bucket.percent)}%` }}></span>
                </div>
                <strong>{bucket.count}</strong>
                <small>{bucket.label}</small>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><PortfolioIcon />Premium by Status</h2>
            <span>{formatCurrency(metrics.totalPremium)}</span>
          </div>
          <div className={styles.statusPanel} aria-label="Premium by status filters">
            {statusPanelRows.map(row => (
              <button
                key={row.status}
                type="button"
                className={`${styles.statusButton} ${activeStatus === row.status ? styles.statusButtonActive : ''}`}
                style={{ '--status-color': row.color }}
                onClick={() => setActiveStatus(row.status)}
              >
                <span className={styles.statusCardIcon}>{getStatusCardIcon(row.status)}</span>
                <span className={styles.statusButtonInfo}>
                  <span className={styles.statusButtonTop}>{row.status}</span>
                  <strong>{loading ? '-' : row.count}</strong>
                </span>
              </button>
            ))}
          </div>
          <div className={styles.valueList}>
            {visibleStatusRows.map(row => (
              <div className={styles.valueItem} key={row.status}>
                <span><i style={{ background: row.color }}></i>{row.status}</span>
                <strong>{formatCurrency(row.premium)}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2><InsightIcon />Important Data</h2>
            <span>Action signals</span>
          </div>
          <div className={styles.insightList}>
            <div>
              <strong>{metrics.counts?.Overdue || 0}</strong>
              <span>Overdue policies need immediate follow-up.</span>
            </div>
            <div>
              <strong>{metrics.counts?.['Grace Period'] || 0}</strong>
              <span>Grace-period policies should be prioritized today.</span>
            </div>
            <div>
              <strong>{metrics.counts?.Lapsed || 0}</strong>
              <span>Lapsed policies may need recovery or fresh onboarding.</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function getStatusCardIcon(status) {
  const icons = {
    All: <PolicyTotalIcon />,
    Paid: <PolicyPaidIcon />,
    'Renew Done': <PolicyRenewDoneIcon />,
    Pending: <PolicyPendingIcon />,
    Overdue: <PolicyOverdueIcon />,
    'Grace Period': <PolicyGraceIcon />,
    Lapsed: <PolicyLapsedIcon />
  };

  return icons[status] || <StatusIcon />;
}

function MetricCard({ icon, label, value, hint, tone, href }) {
  const content = (
    <>
      <span className={styles.metricIcon}>{icon}</span>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
      <span className={styles.metricHint}>{hint}</span>
    </>
  );

  if (href) {
    return <Link href={href} className={`${styles.metricCard} ${styles[tone]}`}>{content}</Link>;
  }

  return <div className={`${styles.metricCard} ${styles[tone]}`}>{content}</div>;
}

const PortfolioIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 21h18"/>
    <path d="M5 21V7l8-4v18"/>
    <path d="M19 21V11l-6-4"/>
    <path d="M9 9h1M9 13h1M9 17h1"/>
  </svg>
);

const RenewalIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <path d="M16 2v4M8 2v4M3 10h18"/>
    <path d="M9 16h6"/>
  </svg>
);

const PolicyTotalIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
  </svg>
);

const PolicyPendingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
);

const PolicyPaidIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22,4 12,14.01 9,11.01"/>
  </svg>
);

const PolicyRenewDoneIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
    <path d="M21 4v6h-6"/>
    <path d="M9 12l2 2 5-5"/>
  </svg>
);

const PolicyOverdueIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 9v4"/>
    <path d="M12 17h.01"/>
    <circle cx="12" cy="12" r="10"/>
  </svg>
);

const PolicyGraceIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2v4"/>
    <path d="M12 18v4"/>
    <path d="M4.93 4.93l2.83 2.83"/>
    <path d="M16.24 16.24l2.83 2.83"/>
    <circle cx="12" cy="12" r="4"/>
  </svg>
);

const PolicyLapsedIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 2h4"/>
    <path d="M12 14l4-4"/>
    <circle cx="12" cy="14" r="8"/>
  </svg>
);

const StatusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M4 6h16M4 12h10M4 18h7"/>
  </svg>
);

const InsightIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 18h6"/>
    <path d="M10 22h4"/>
    <path d="M12 2a7 7 0 0 0-4 12.74V17h8v-2.26A7 7 0 0 0 12 2z"/>
  </svg>
);
