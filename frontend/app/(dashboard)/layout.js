'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './layout.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_RENEWAL_DAYS = 30;
const ACTIVE_LEAD_STAGES = new Set(['New', 'Contacted', 'Qualified', 'Proposal']);

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function toDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function getDaysFromToday(value, today = startOfToday()) {
  const date = toDateOnly(value);
  if (!date) return null;
  return Math.ceil((date - today) / DAY_MS);
}

function formatReminderDate(value) {
  const date = toDateOnly(value);
  if (!date) return 'No date';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function describeDays(days) {
  if (days === null) return 'date not set';
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return 'due today';
  return `due in ${days} day${days === 1 ? '' : 's'}`;
}

function reminderWeight(type) {
  return {
    lapsed: 0,
    overdue: 1,
    paymentDue: 2,
    grace: 3,
    renewal: 4,
    leadFollowUp: 5,
    leadPriority: 6
  }[type] ?? 9;
}

function buildPolicyReminder(policy, type, days, href) {
  const labels = {
    lapsed: 'Lapsed policy',
    overdue: 'Overdue renewal',
    paymentDue: 'Payment due',
    grace: 'Grace-period policy',
    renewal: 'Upcoming renewal'
  };

  return {
    id: `policy-${type}-${policy.id}`,
    type,
    title: labels[type],
    message: `${policy.client_name || 'Client'} - ${policy.policy_number || 'Policy'} - ${describeDays(days)}`,
    meta: `${policy.insurance_company || 'Health policy'} - ${formatReminderDate(type === 'paymentDue' ? policy.payment_due_date : policy.due_date)}`,
    href,
    icon: type === 'paymentDue' ? 'payment' : type === 'lapsed' || type === 'overdue' ? 'clock' : 'calendar',
    days: days ?? 999
  };
}

function buildLeadReminder(lead, type, days) {
  return {
    id: `lead-${type}-${lead.id}`,
    type,
    title: type === 'leadPriority' ? 'High-priority lead' : 'Lead follow-up',
    message: `${lead.client_name || 'Lead'} - ${lead.stage || 'New'} - ${type === 'leadPriority' ? 'needs attention' : describeDays(days)}`,
    meta: `${lead.phone || lead.email || 'No contact'}${lead.next_follow_up ? ` - ${formatReminderDate(lead.next_follow_up)}` : ''}`,
    href: '/leads',
    icon: 'lead',
    days: days ?? 999
  };
}

function buildReminders(policies = [], leads = []) {
  const today = startOfToday();
  const reminders = [];

  policies.forEach(policy => {
    const status = policy.status || 'Pending';
    const dueDays = getDaysFromToday(policy.due_date, today);
    const paymentDays = getDaysFromToday(policy.payment_due_date || policy.due_date, today);
    const isPaid = status === 'Paid';
    const isLapsed = status === 'Lapsed';

    if (isLapsed) {
      reminders.push(buildPolicyReminder(policy, 'lapsed', dueDays, '/expired-policies'));
      return;
    }

    if (!isPaid && (status === 'Overdue' || (dueDays !== null && dueDays < 0))) {
      reminders.push(buildPolicyReminder(policy, 'overdue', dueDays, '/expired-policies'));
      return;
    }

    if (!isPaid && status === 'Grace Period') {
      reminders.push(buildPolicyReminder(policy, 'grace', dueDays, '/upcoming-renewals'));
    }

    if (!isPaid && paymentDays !== null && paymentDays <= 0) {
      reminders.push(buildPolicyReminder(policy, 'paymentDue', paymentDays, '/payment-due-policy'));
    }

    if (!isPaid && dueDays !== null && dueDays >= 0 && dueDays <= UPCOMING_RENEWAL_DAYS) {
      reminders.push(buildPolicyReminder(policy, 'renewal', dueDays, '/upcoming-renewals'));
    }
  });

  leads.forEach(lead => {
    if (!ACTIVE_LEAD_STAGES.has(lead.stage || 'New')) return;
    const followUpDays = getDaysFromToday(lead.next_follow_up, today);

    if (followUpDays !== null && followUpDays <= 0) {
      reminders.push(buildLeadReminder(lead, 'leadFollowUp', followUpDays));
      return;
    }

    if (lead.priority === 'High') {
      reminders.push(buildLeadReminder(lead, 'leadPriority', followUpDays));
    }
  });

  return reminders
    .sort((a, b) => reminderWeight(a.type) - reminderWeight(b.type) || a.days - b.days);
}

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [reminders, setReminders] = useState([]);
  const [readReminderIds, setReadReminderIds] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [now, setNow] = useState(new Date());
  const profileRef = useRef(null);
  const notificationRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = getStoredUser();

    if (token && storedUser) {
      setUser(storedUser);
      setIsAuthenticated(true);
    } else {
      router.push('/login');
    }
    setIsChecking(false);
  }, [router]);

  useEffect(() => {
    setProfileOpen(false);
    setNotificationOpen(false);
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const refreshUser = () => setUser(getStoredUser());
    window.addEventListener('crm-user-updated', refreshUser);
    window.addEventListener('storage', refreshUser);
    return () => {
      window.removeEventListener('crm-user-updated', refreshUser);
      window.removeEventListener('storage', refreshUser);
    };
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let active = true;
    setNotificationLoading(true);

    Promise.allSettled([
      api.get('/policies?page=1&limit=1000&sort_by=due_date&sort_order=asc'),
      api.get('/leads')
    ])
      .then(([policyResult, leadResult]) => {
        if (!active) return;

        const policies = policyResult.status === 'fulfilled' ? policyResult.value.policies || [] : [];
        const leads = leadResult.status === 'fulfilled' ? leadResult.value.leads || [] : [];
        const nextReminders = buildReminders(policies, leads);
        setReminders(nextReminders);

        const toastKey = `crm-reminders:${user.email || user.id || 'user'}:${startOfToday().toISOString().slice(0, 10)}`;
        if (sessionStorage.getItem(toastKey)) return;

        sessionStorage.setItem(toastKey, 'shown');
        if (nextReminders.length > 0) {
          toast.warning(
            `${nextReminders.length} reminder${nextReminders.length === 1 ? '' : 's'} need attention. Open the bell for client renewals, overdue, lapsed, payments, and lead follow-ups.`,
            'CRM Reminders'
          );
        } else {
          toast.info('No urgent renewal, payment, lapsed, or lead follow-up reminders right now.', 'CRM Reminders');
        }
      })
      .catch(error => {
        console.error('Failed to load CRM reminders:', error);
      })
      .finally(() => {
        if (active) setNotificationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated, toast, user]);

  useEffect(() => {
    if (!user) return;

    try {
      const stored = localStorage.getItem(getReminderReadKey(user));
      const ids = stored ? JSON.parse(stored) : [];
      setReadReminderIds(Array.isArray(ids) ? ids : []);
    } catch {
      setReadReminderIds([]);
    }
  }, [user]);

  const getInitial = (name) => {
    if (!name) return 'U';
    return name.charAt(0).toUpperCase();
  };

  const getStoredUser = () => {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch {
      return null;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setProfileOpen(false);
    router.push('/login');
  };

  const getReminderReadKey = (currentUser = user) => {
    return `crm-notification-read:${currentUser?.email || currentUser?.id || 'user'}`;
  };

  const saveReadReminderIds = (ids) => {
    localStorage.setItem(getReminderReadKey(), JSON.stringify(ids));
  };

  const markReminderAsRead = (id) => {
    setReadReminderIds(current => {
      if (current.includes(id)) return current;
      const next = [...current, id];
      saveReadReminderIds(next);
      return next;
    });
  };

  const markAllRemindersAsRead = () => {
    setReadReminderIds(current => {
      const next = Array.from(new Set([...current, ...reminders.map(reminder => reminder.id)]));
      saveReadReminderIds(next);
      return next;
    });
  };

  const today = now.toLocaleString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  const roleLabel = {
    super_admin: 'SuperAdmin',
    admin: 'Admin',
    team_member: 'Team Member'
  }[user?.role] || 'Team Member';
  const isSuperAdmin = user?.role === 'super_admin';
  const isAdmin = user?.role === 'admin';
  const commandItems = [
    { label: 'Dashboard', description: 'Executive health policy summary', href: '/dashboard', keywords: 'home overview graphs executive' },
    { label: 'Policies', description: 'Search and manage health policies', href: '/policies', keywords: 'policy all records portfolio' },
    { label: 'Add Policy', description: 'Create a new health policy', href: '/policies/new', keywords: 'new create add policy' },
    { label: 'Import Policies', description: 'Bulk upload CSV or XLSX policies', href: '/policies/import', keywords: 'upload bulk import excel csv' },
    { label: 'Lead Management', description: 'Manage incoming health policy leads', href: '/leads', keywords: 'lead leads pipeline follow up remark' },
    { label: 'Clients', description: 'Client portfolio and contact records', href: '/clients', keywords: 'customer client contact' },
    { label: 'Upcoming Renewals', description: 'Renewal follow-up queue', href: '/upcoming-renewals', keywords: 'renewal renew expiring upcoming' },
    { label: 'Expired Policies', description: 'Expired and overdue coverage', href: '/expired-policies', keywords: 'expired overdue lapse' },
    { label: 'Payment Due', description: 'Premium payment follow-ups', href: '/payment-due-policy', keywords: 'payment premium due collection' },
    { label: 'Interactions', description: 'Policy communication logs', href: '/interactions', keywords: 'logs remarks communication interaction' },
    ...(isSuperAdmin || isAdmin ? [
      { label: 'Policy Types', description: 'Health policy type settings', href: '/policy-types', keywords: 'configuration policy type settings' }
    ] : []),
    ...(isSuperAdmin ? [
      { label: 'Team Users', description: 'Create admins and team members', href: '/team-users', keywords: 'user admin team member access role' },
      { label: 'Audit Logs', description: 'Review CRM activity logs', href: '/audit-logs', keywords: 'audit history testing superadmin logs' }
    ] : []),
    { label: 'Account Settings', description: 'Profile picture and account details', href: '/settings', keywords: 'profile avatar account settings user' }
  ];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchResults = (normalizedSearch
    ? commandItems.filter(item => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(normalizedSearch))
    : commandItems
  ).slice(0, 7);
  const unreadReminders = reminders.filter(reminder => !readReminderIds.includes(reminder.id));
  const notificationCount = unreadReminders.length;
  const notificationCountLabel = notificationCount > 99 ? '99+' : String(notificationCount);

  const openSearchTarget = (href) => {
    setSearchOpen(false);
    setSearchTerm('');
    router.push(href);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const query = searchTerm.trim();
    if (!query) {
      setSearchOpen(true);
      return;
    }

    openSearchTarget(searchResults[0]?.href || `/policies?search=${encodeURIComponent(query)}`);
  };

  if (isChecking) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner}></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={styles.dashboardLayout}>
      <aside className={styles.sidebar}>
        <Link href="/dashboard" className={styles.logoSection} aria-label="Insured dashboard">
          <Image src="/logo.png" alt="Insured" width={90} height={70} className={styles.logoImg} priority />
        </Link>

        <nav className={styles.nav}>
          <span className={styles.navGroup}>Operations</span>
          <Link href="/dashboard" className={`${styles.navItem} ${pathname === '/dashboard' ? styles.active : ''}`}>
            <span className={styles.navIcon}><DashboardIcon /></span>
            Dashboard
          </Link>
          <Link href="/policies" className={`${styles.navItem} ${pathname === '/policies' || pathname.startsWith('/policies/edit') ? styles.active : ''}`}>
            <span className={styles.navIcon}><PolicyIcon /></span>
            Policies
          </Link>
          <Link href="/all-policy" className={`${styles.navItem} ${pathname === '/all-policy' ? styles.active : ''}`}>
            <span className={styles.navIcon}><PolicyIcon /></span>
            All Policy
          </Link>
          <Link href="/policies/new" className={`${styles.navItem} ${pathname === '/policies/new' ? styles.active : ''}`}>
            <span className={styles.navIcon}><AddIcon /></span>
            Add Policy
          </Link>
          <Link href="/policies/import" className={`${styles.navItem} ${pathname === '/policies/import' ? styles.active : ''}`}>
            <span className={styles.navIcon}><ImportIcon /></span>
            Import Policies
          </Link>
          <Link href="/interactions" className={`${styles.navItem} ${pathname === '/interactions' ? styles.active : ''}`}>
            <span className={styles.navIcon}><LogIcon /></span>
            Interactions
          </Link>
          <Link href="/leads" className={`${styles.navItem} ${pathname === '/leads' ? styles.active : ''}`}>
            <span className={styles.navIcon}><LeadIcon /></span>
            Lead Management
          </Link>
          {isSuperAdmin && (
            <>
              <span className={styles.navGroup}>SuperAdmin</span>
              <Link href="/team-users" className={`${styles.navItem} ${pathname === '/team-users' ? styles.active : ''}`}>
                <span className={styles.navIcon}><UsersIcon /></span>
                Team Users
              </Link>
              <Link href="/audit-logs" className={`${styles.navItem} ${pathname === '/audit-logs' ? styles.active : ''}`}>
                <span className={styles.navIcon}><AuditIcon /></span>
                Audit Logs
              </Link>
            </>
          )}
          <span className={styles.navGroup}>Renewals</span>
          <Link href="/upcoming-renewals" className={`${styles.navItem} ${pathname === '/upcoming-renewals' ? styles.active : ''}`}>
            <span className={styles.navIcon}><CalendarIcon /></span>
            Upcoming Renewals
          </Link>
          <Link href="/expired-policies" className={`${styles.navItem} ${pathname === '/expired-policies' ? styles.active : ''}`}>
            <span className={styles.navIcon}><ClockIcon /></span>
            Expired Policies
          </Link>
          <Link href="/upcoming-expired-policy" className={`${styles.navItem} ${pathname === '/upcoming-expired-policy' ? styles.active : ''}`}>
            <span className={styles.navIcon}><CalendarIcon /></span>
            Upcoming Expiry
          </Link>
          <Link href="/payment-due-policy" className={`${styles.navItem} ${pathname === '/payment-due-policy' ? styles.active : ''}`}>
            <span className={styles.navIcon}><PaymentIcon /></span>
            Payment Due
          </Link>
          <Link href="/upcoming-payment-policy" className={`${styles.navItem} ${pathname === '/upcoming-payment-policy' ? styles.active : ''}`}>
            <span className={styles.navIcon}><CalendarIcon /></span>
            Upcoming Payment
          </Link>
          <span className={styles.navGroup}>Customers</span>
          <Link href="/clients" className={`${styles.navItem} ${pathname === '/clients' ? styles.active : ''}`}>
            <span className={styles.navIcon}><ClientIcon /></span>
            Manage Clients
          </Link>
          {(isSuperAdmin || isAdmin) && (
            <Link href="/clients/new" className={`${styles.navItem} ${pathname === '/clients/new' ? styles.active : ''}`}>
              <span className={styles.navIcon}><ClientIcon /></span>
              Add Client
            </Link>
          )}
          {(isSuperAdmin || isAdmin) && (
            <>
              <span className={styles.navGroup}>Configuration</span>
              <Link href="/policy-types" className={`${styles.navItem} ${pathname === '/policy-types' ? styles.active : ''}`}>
                <span className={styles.navIcon}><SettingsIcon /></span>
                Policy Types
              </Link>
            </>
          )}
        </nav>
      </aside>

      <main className={styles.mainContent}>
        <div className={styles.topbar}>
          <div className={styles.headerBrand} aria-label="CRM name">
            <span className={styles.brandTitle}>Insured</span>
          </div>
          <div className={styles.topbarActions}>
            <form className={styles.searchWrap} onSubmit={handleSearchSubmit} ref={searchRef}>
              <label className={styles.searchBox}>
              <SearchIcon />
                <input
                  type="search"
                  placeholder="Search CRM"
                  aria-label="Search CRM functionality"
                  value={searchTerm}
                  onChange={(event) => {
                    setSearchTerm(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                />
              </label>
              {searchOpen && (
                <div className={styles.searchMenu}>
                  <div className={styles.menuHeader}>
                    <div>
                      <h2>CRM Search</h2>
                      <p>Open pages, actions, and policy search</p>
                    </div>
                    <span>{searchResults.length}</span>
                  </div>
                  {searchResults.length > 0 ? searchResults.map(item => (
                    <button key={item.href} type="button" className={styles.searchItem} onClick={() => openSearchTarget(item.href)}>
                      <SearchIcon />
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                    </button>
                  )) : (
                    <button type="button" className={styles.searchItem} onClick={() => openSearchTarget(`/policies?search=${encodeURIComponent(searchTerm.trim())}`)}>
                      <PolicyIcon />
                      <span>
                        <strong>Search policies</strong>
                        <small>Find client policies matching &quot;{searchTerm.trim()}&quot;</small>
                      </span>
                    </button>
                  )}
                </div>
              )}
            </form>
            <button className={styles.datePill} type="button">
              <CalendarIcon />
              {today}
            </button>
            <Link className={styles.primaryAction} href="/policies/new">
              <AddIcon />
              New Policy
            </Link>
            <div className={styles.notificationWrap} ref={notificationRef}>
              <button
                className={`${styles.iconButton} ${notificationOpen ? styles.iconButtonActive : ''}`}
                type="button"
                aria-label="Notifications"
                aria-expanded={notificationOpen}
                onClick={() => {
                  setNotificationOpen(open => !open);
                  setProfileOpen(false);
                }}
              >
                <BellIcon />
                <span className={`${styles.notificationDot} ${notificationCount === 0 ? styles.notificationDotIdle : ''}`}>{notificationCountLabel}</span>
              </button>
              {notificationOpen && (
                <div className={styles.notificationMenu}>
                  <div className={styles.menuHeader}>
                    <div>
                      <h2>Notifications</h2>
                      <p>Renewal, payment, lapsed, and lead reminders</p>
                    </div>
                    <span>{notificationLoading ? 'Loading' : `${notificationCount} unread`}</span>
                  </div>
                  {reminders.length > 0 && (
                    <div className={styles.notificationToolbar}>
                      <span>{reminders.length} total reminders</span>
                      <button type="button" onClick={markAllRemindersAsRead} disabled={notificationCount === 0}>
                        Mark all read
                      </button>
                    </div>
                  )}
                  <div className={styles.notificationList}>
                    {notificationLoading ? (
                      <div className={styles.notificationEmpty}>Loading reminders...</div>
                    ) : reminders.length > 0 ? reminders.map(reminder => (
                      <div
                        className={`${styles.notificationItem} ${readReminderIds.includes(reminder.id) ? styles.notificationItemRead : ''}`}
                        key={reminder.id}
                      >
                        <Link href={reminder.href} className={styles.notificationContent} onClick={() => markReminderAsRead(reminder.id)}>
                          <ReminderIcon type={reminder.icon} />
                          <span>
                            <strong>{reminder.title}</strong>
                            <small>{reminder.message}</small>
                            <em>{reminder.meta}</em>
                          </span>
                        </Link>
                        <button
                          type="button"
                          className={styles.markReadButton}
                          onClick={() => markReminderAsRead(reminder.id)}
                          disabled={readReminderIds.includes(reminder.id)}
                        >
                          {readReminderIds.includes(reminder.id) ? 'Read' : 'Mark read'}
                        </button>
                      </div>
                    )) : (
                      <div className={styles.notificationEmpty}>No urgent reminders right now.</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className={styles.headerProfile} ref={profileRef}>
              <button
                type="button"
                className={`${styles.profileTrigger} ${profileOpen ? styles.profileTriggerActive : ''}`}
                onClick={() => {
                  setProfileOpen(open => !open);
                  setNotificationOpen(false);
                }}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
              >
                <UserAvatar user={user} fallback={getInitial(user?.name)} className={styles.userAvatar} />
                <span className={styles.headerUserText}>
                  <span className={styles.userName}>{user?.name || 'User'}</span>
                  <span className={styles.userEmail}>{roleLabel}</span>
                </span>
              </button>
              {profileOpen && (
                <div className={styles.profileMenu} role="menu">
                  <span className={styles.profileBadge}>Profile</span>
                  <div className={styles.profileHero}>
                    <UserAvatar user={user} fallback={getInitial(user?.name)} className={styles.profileAvatarLarge} />
                    <div>
                      <h2>{user?.name || 'User'}</h2>
                      <p>{user?.email}</p>
                      <span>{user?.designation || roleLabel}</span>
                    </div>
                  </div>
                  <span className={styles.profileRole}>{roleLabel}</span>
                  <div className={styles.profileDivider}></div>
                  <Link className={styles.profileMenuItem} href="/settings" role="menuitem">
                    <SettingsIcon />
                    Account settings
                  </Link>
                  <button type="button" className={`${styles.profileMenuItem} ${styles.logoutItem}`} onClick={handleLogout} role="menuitem">
                    <LogoutIcon />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className={styles.pageBody}>{children}</div>
      </main>
    </div>
  );
}

function UserAvatar({ user, fallback, className }) {
  if (user?.avatar_url) {
    return (
      <span
        className={`${className} ${styles.avatarImage}`}
        style={{ backgroundImage: `url("${user.avatar_url}")` }}
        aria-label={`${user?.name || 'User'} profile picture`}
      />
    );
  }

  return <span className={className}>{fallback}</span>;
}

function ReminderIcon({ type }) {
  if (type === 'payment') return <PaymentIcon />;
  if (type === 'lead') return <LeadIcon />;
  if (type === 'clock') return <ClockIcon />;
  return <CalendarIcon />;
}

const DashboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
  </svg>
);

const PolicyIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const AddIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="16"/>
    <line x1="8" y1="12" x2="16" y2="12"/>
  </svg>
);

const ImportIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="17,8 12,3 7,8"/>
    <line x1="12" y1="3" x2="12" y2="15"/>
  </svg>
);

const ClientIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
);

const LogIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14,2 14,8 20,8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);

const LeadIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const AuditIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 11l3 3L22 4"/>
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);

const CalendarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="4" width="18" height="18" rx="2"/>
    <line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/>
    <line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);

const BellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
);

const PaymentIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <line x1="2" y1="10" x2="22" y2="10"/>
  </svg>
);

const SettingsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.2.36.49.66.85.85.28.15.6.23.92.24H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/>
  </svg>
);

const LogoutIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16,17 21,12 16,7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);
