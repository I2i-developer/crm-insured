'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

export default function AuditLogsPage() {
  const toast = useToast();
  const router = useRouter();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ action: '', entity_type: '' });

  useEffect(() => {
    let active = true;
    api.get('/auth/me')
      .then(data => {
        if (!active) return;
        if (data.user?.role !== 'super_admin') {
          toast.error('Only SuperAdmin can view audit logs.');
          router.push('/dashboard');
          return;
        }
        fetchLogs();
      })
      .catch(error => {
        toast.error(error.message || 'Failed to verify SuperAdmin access.');
        router.push('/dashboard');
      });

    return () => {
      active = false;
    };
  }, [filters, router, toast]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '150', ...filters });
      const data = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(data.auditLogs || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = useMemo(() => ({
    actions: Array.from(new Set(logs.map(log => log.action))).filter(Boolean),
    entities: Array.from(new Set(logs.map(log => log.entity_type))).filter(Boolean)
  }), [logs]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Audit Logs</h1>
          <p>SuperAdmin activity trail for CRM changes and user-management actions.</p>
        </div>
      </header>

      <section className={styles.filters}>
        <select value={filters.action} onChange={(e) => setFilters(current => ({ ...current, action: e.target.value }))}>
          <option value="">All actions</option>
          {filterOptions.actions.map(action => <option key={action} value={action}>{action}</option>)}
        </select>
        <select value={filters.entity_type} onChange={(e) => setFilters(current => ({ ...current, entity_type: e.target.value }))}>
          <option value="">All entities</option>
          {filterOptions.entities.map(entity => <option key={entity} value={entity}>{entity}</option>)}
        </select>
        <button type="button" onClick={fetchLogs}>Refresh</button>
      </section>

      <section className={styles.tablePanel}>
        {loading ? (
          <div className={styles.state}>Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <div className={styles.state}>No audit logs found.</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Summary</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString('en-IN')}</td>
                  <td>
                    <strong>{log.actor_email || 'System'}</strong>
                    <small>{log.actor_role || '-'}</small>
                  </td>
                  <td><span className={styles.actionPill}>{log.action}</span></td>
                  <td>{log.entity_type}{log.entity_id ? ` #${String(log.entity_id).slice(0, 8)}` : ''}</td>
                  <td>{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
