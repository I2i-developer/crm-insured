'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

const emptyForm = {
  name: '',
  email: '',
  password: '',
  role: 'team_member',
  designation: ''
};

const roleLabels = {
  super_admin: 'SuperAdmin',
  admin: 'Admin / Team Head',
  team_member: 'Team Member'
};

export default function TeamUsersPage() {
  const toast = useToast();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    if (storedUser?.role !== 'super_admin') {
      toast.error('Only SuperAdmin can manage CRM users.');
      router.push('/dashboard');
      return;
    }
    fetchUsers();
  }, [router, toast]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await api.get('/users');
      setUsers(data.users || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => ({
    admins: users.filter(user => user.role === 'admin').length,
    teamMembers: users.filter(user => user.role === 'team_member').length,
    superAdmins: users.filter(user => user.role === 'super_admin').length
  }), [users]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post('/users', form);
      toast.success('CRM user created successfully.');
      setForm(emptyForm);
      fetchUsers();
    } catch (error) {
      toast.error(error.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(current => ({ ...current, [name]: value }));
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Team Users</h1>
          <p>Create Admin and Team Member accounts for CRM testing and rollout.</p>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <SummaryCard label="SuperAdmins" value={summary.superAdmins} />
        <SummaryCard label="Admins / Team Heads" value={summary.admins} />
        <SummaryCard label="Team Members" value={summary.teamMembers} />
      </section>

      <section className={styles.workspace}>
        <form className={styles.formPanel} onSubmit={handleSubmit}>
          <div className={styles.panelTitle}>
            <h2>Create User</h2>
            <span>SuperAdmin only</span>
          </div>

          <label>
            Name
            <input name="name" value={form.name} onChange={handleChange} required />
          </label>

          <label>
            Email
            <input type="email" name="email" value={form.email} onChange={handleChange} required />
          </label>

          <label>
            Temporary password
            <input type="password" name="password" value={form.password} onChange={handleChange} required minLength="6" />
          </label>

          <label>
            Role
            <select name="role" value={form.role} onChange={handleChange} required>
              <option value="admin">Admin / Team Head</option>
              <option value="team_member">Team Member</option>
            </select>
          </label>

          <label>
            Designation
            <input name="designation" value={form.designation} onChange={handleChange} placeholder="Team Head, Sales Agent" />
          </label>

          <button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
        </form>

        <div className={styles.tablePanel}>
          {loading ? (
            <div className={styles.state}>Loading users...</div>
          ) : users.length === 0 ? (
            <div className={styles.state}>No users found.</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Designation</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className={styles.userCell}>
                        <span>{user.name?.charAt(0)?.toUpperCase() || 'U'}</span>
                        <div>
                          <strong>{user.name}</strong>
                          <small>{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td><span className={styles.rolePill}>{roleLabels[user.role] || user.role}</span></td>
                    <td>{user.designation || '-'}</td>
                    <td>{new Date(user.created_at).toLocaleDateString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className={styles.summaryCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
