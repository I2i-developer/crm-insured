'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from '@/components/policy-report.module.css';

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDate(date) {
  if (!date) return 'No renewal';
  return new Date(date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

function getClientInitial(name) {
  const cleaned = String(name || '')
    .replace(/^\s*(mr|mrs|ms|miss|dr|shri|smt)\.?\s+/i, '')
    .trim();
  return (cleaned.charAt(0) || 'C').toUpperCase();
}

export default function ManageClientsPage() {
  const toast = useToast();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/policies?page=1&limit=1000&sort_by=due_date&sort_order=asc')
      .then(data => {
        if (active) setPolicies(data.policies || []);
      })
      .catch(error => {
        console.error('Failed to load clients:', error);
        toast.error('Failed to load clients.');
        if (active) setPolicies([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [toast]);

  const clients = useMemo(() => {
    const records = new Map();

    policies.forEach(policy => {
      const key = `${policy.email || ''}-${policy.phone || ''}-${policy.client_name}`.toLowerCase();
      const existing = records.get(key) || {
        name: policy.client_name,
        email: policy.email || 'Not captured',
        phone: policy.phone || 'Not captured',
        policies: 0,
        activePolicies: 0,
        premium: 0,
        nextDueDate: null,
        latestStatus: policy.status
      };

      existing.policies += 1;
      existing.activePolicies += ['Paid', 'Renew Done', 'Pending'].includes(policy.status) ? 1 : 0;
      if (policy.status !== 'Lapsed') {
        existing.premium += Number(policy.premium_amount || 0);
      }
      existing.latestStatus = policy.status;

      const dueDate = new Date(policy.due_date);
      if (!existing.nextDueDate || dueDate < new Date(existing.nextDueDate)) {
        existing.nextDueDate = policy.due_date;
      }

      records.set(key, existing);
    });

    return [...records.values()]
      .filter(client => client.name?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [policies, search]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Manage Clients</h1>
          <p>Centralized client portfolio view built from policy, contact, payment, and renewal data.</p>
        </div>
        <div className={styles.actions}>
          <Link href="/clients/new" className={styles.primaryBtn}>New Client</Link>
          <Link href="/policies/new" className={styles.secondaryBtn}>New Policy</Link>
        </div>
      </header>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Clients</span>
          <span className={styles.statValue}>{loading ? '-' : clients.length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Policies</span>
          <span className={styles.statValue}>{loading ? '-' : policies.length}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Portfolio Value</span>
          <span className={styles.statValue}>{loading ? '-' : formatCurrency(clients.reduce((sum, client) => sum + client.premium, 0))}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Avg Policies / Client</span>
          <span className={styles.statValue}>{loading || clients.length === 0 ? '-' : (policies.length / clients.length).toFixed(1)}</span>
        </div>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Client Search</h2>
        <div className={styles.filters}>
          <input className={styles.input} value={search} onChange={event => setSearch(event.target.value)} placeholder="Search client name" />
        </div>
      </section>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.loading}>Loading clients...</div>
        ) : clients.length === 0 ? (
          <div className={styles.empty}>No clients found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Client</th>
                <th>Contact</th>
                <th>Policies</th>
                <th>Active</th>
                <th>Next Renewal</th>
                <th>Portfolio Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(client => (
                <tr key={`${client.email}-${client.phone}-${client.name}`}>
                  <td>
                    <div className={styles.clientCell}>
                      <div className={styles.avatar}>{getClientInitial(client.name)}</div>
                      <span>{client.name}</span>
                    </div>
                  </td>
                  <td>
                    <div>{client.phone}</div>
                    <div className={styles.muted}>{client.email}</div>
                  </td>
                  <td>{client.policies}</td>
                  <td>{client.activePolicies}</td>
                  <td>{formatDate(client.nextDueDate)}</td>
                  <td className={styles.amount}>{formatCurrency(client.premium)}</td>
                  <td><span className={`${styles.badge} ${styles[`badge${client.latestStatus?.replace(/\s+/g, '')}`]}`}>{client.latestStatus}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
