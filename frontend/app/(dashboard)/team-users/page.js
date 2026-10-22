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
  designation: '',
  reports_to: '',
  portfolio_access_scope: 'team'
};

const roleLabels = {
  super_admin: 'SuperAdmin',
  admin: 'Admin',
  team_head: 'Team Head',
  team_member: 'Team Member'
};

export default function TeamUsersPage() {
  const toast = useToast();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [editingId, setEditingId] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    setCurrentUser(storedUser);
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
    teamHeads: users.filter(user => user.role === 'team_head').length,
    teamMembers: users.filter(user => user.role === 'team_member').length,
    superAdmins: users.filter(user => user.role === 'super_admin').length
  }), [users]);

  const managers = useMemo(() => {
    const requiredRole = form.role === 'team_member' ? 'team_head' : '';
    return requiredRole ? users.filter(user => user.role === requiredRole && user.id !== editingId) : [];
  }, [editingId, form.role, users]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.put('/users', { ...form, id: editingId });
        toast.success('CRM user updated successfully.');
      } else {
        await api.post('/users', form);
        toast.success('CRM user created successfully.');
      }
      setForm(emptyForm);
      setEditingId('');
      fetchUsers();
    } catch (error) {
      toast.error(error.message || 'Failed to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm(current => ({
      ...current,
      [name]: value,
      ...(name === 'role' ? { reports_to: '', portfolio_access_scope: 'team' } : {})
    }));
  };

  const handleEditUser = (user) => {
    setEditingId(user.id);
    setForm({
      name: user.name || '',
      email: user.email || '',
      password: '',
      role: user.role,
      designation: user.designation || '',
      reports_to: user.reports_to || '',
      portfolio_access_scope: user.portfolio_access_scope || 'team'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId('');
    setForm(emptyForm);
  };

  const handleDeleteUser = async (user) => {
    if (user.id === currentUser?.id) {
      toast.error('You cannot delete your own SuperAdmin account.');
      return;
    }

    const confirmed = await toast.confirm({
      title: 'Delete CRM user?',
      message: `Delete ${user.name} (${user.email}) from the CRM? Their assigned records will be transferred before deletion.`,
      confirmLabel: 'Delete'
    });
    if (!confirmed) return;

    setDeletingId(user.id);
    try {
      await api.delete(`/users?id=${encodeURIComponent(user.id)}`);
      toast.success('CRM user deleted successfully.');
      fetchUsers();
    } catch (error) {
      toast.error(error.message || 'Failed to delete user.');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Team Users</h1>
          <p>Admins oversee all Team Heads; assign each Team Member to a specific Team Head.</p>
        </div>
      </header>

      <section className={styles.summaryGrid}>
        <SummaryCard label="SuperAdmins" value={summary.superAdmins} />
        <SummaryCard label="Admins" value={summary.admins} />
        <SummaryCard label="Team Heads" value={summary.teamHeads} />
        <SummaryCard label="Team Members" value={summary.teamMembers} />
      </section>

      <section className={styles.workspace}>
        <form className={styles.formPanel} onSubmit={handleSubmit}>
          <div className={styles.panelTitle}>
            <h2>{editingId ? 'Edit User' : 'Create User'}</h2>
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
            {editingId ? 'New password (optional)' : 'Temporary password'}
            <input type="password" name="password" value={form.password} onChange={handleChange} required={!editingId} minLength="6" />
          </label>

          <label>
            Role
            <select name="role" value={form.role} onChange={handleChange} required>
              <option value="admin">Admin</option>
              <option value="team_head">Team Head</option>
              <option value="team_member">Team Member</option>
            </select>
          </label>

          {form.role === 'team_member' && (
            <label>
              Reports to
              <select name="reports_to" value={form.reports_to} onChange={handleChange} required>
                <option value="">Select Team Head</option>
                {managers.map(manager => (
                  <option key={manager.id} value={manager.id}>{manager.name} ({manager.email})</option>
                ))}
              </select>
              {managers.length === 0 && <small className={styles.fieldHint}>Create an eligible manager first.</small>}
            </label>
          )}

          {form.role === 'team_head' && (
            <label>
              Portfolio access
              <select name="portfolio_access_scope" value={form.portfolio_access_scope} onChange={handleChange}>
                <option value="team">Own and team portfolio</option>
                <option value="organization">Entire organization portfolio</option>
              </select>
              <small className={styles.fieldHint}>Organization access shows all CRM policies without changing their ownership.</small>
            </label>
          )}

          <label>
            Designation
            <input name="designation" value={form.designation} onChange={handleChange} placeholder="Team Head, Sales Agent" />
          </label>

          <div className={styles.formActions}>
            {editingId && <button type="button" className={styles.secondaryButton} onClick={cancelEdit}>Cancel</button>}
            <button type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create User'}</button>
          </div>
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
                  <th>Reports To</th>
                  <th>Portfolio Access</th>
                  <th>Created</th>
                  <th>Actions</th>
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
                    <td>{user.role === 'team_head' ? 'All Admins' : user.manager_name || (user.role === 'team_member' ? 'Unassigned' : '-')}</td>
                    <td>{user.role === 'team_head' ? (user.portfolio_access_scope === 'organization' ? 'Entire Organization' : 'Own and Team') : '-'}</td>
                    <td>{new Date(user.created_at).toLocaleDateString('en-IN')}</td>
                    <td>
                      {user.role !== 'super_admin' && (
                        <button
                          type="button"
                          className={styles.editBtn}
                          onClick={() => handleEditUser(user)}
                          title={`Edit ${user.name}`}
                        >
                          <EditIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteUser(user)}
                        disabled={deletingId === user.id || user.id === currentUser?.id}
                        title={user.id === currentUser?.id ? 'You cannot delete your own account' : `Delete ${user.name}`}
                      >
                        {deletingId === user.id ? '...' : <DeleteIcon />}
                      </button>
                    </td>
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

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18"/>
      <path d="M8 6V4h8v2"/>
      <path d="M19 6l-1 15H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
    </svg>
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
