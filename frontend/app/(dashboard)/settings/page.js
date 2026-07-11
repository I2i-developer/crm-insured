'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import styles from './page.module.css';

const emptyProfile = {
  name: '',
  email: '',
  designation: '',
  avatar_url: ''
};

export default function SettingsPage() {
  const toast = useToast();
  const [profile, setProfile] = useState(emptyProfile);
  const [role, setRole] = useState('team_member');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const data = await api.get('/auth/me');
      setProfile({
        name: data.user.name || '',
        email: data.user.email || '',
        designation: data.user.designation || '',
        avatar_url: data.user.avatar_url || ''
      });
      setRole(data.user.role || 'team_member');
      localStorage.setItem('user', JSON.stringify(data.user));
      window.dispatchEvent(new Event('crm-user-updated'));
    } catch (error) {
      toast.error(error.message || 'Failed to load profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setProfile(current => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await api.put('/auth/me', profile);
      localStorage.setItem('user', JSON.stringify(data.user));
      window.dispatchEvent(new Event('crm-user-updated'));
      setProfile({
        name: data.user.name || '',
        email: data.user.email || '',
        designation: data.user.designation || '',
        avatar_url: data.user.avatar_url || ''
      });
      setRole(data.user.role || 'team_member');
      toast.success('Profile updated successfully.');
    } catch (error) {
      toast.error(error.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const roleLabel = {
    super_admin: 'SuperAdmin',
    admin: 'Admin',
    team_member: 'Team Member'
  }[role] || 'Team Member';

  const initial = profile.name ? profile.name.charAt(0).toUpperCase() : 'U';

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading settings...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Account Settings</h1>
          <p>Manage your CRM profile, picture, and contact identity.</p>
        </div>
      </header>

      <section className={styles.grid}>
        <aside className={styles.previewPanel}>
          <div
            className={`${styles.avatarPreview} ${profile.avatar_url ? styles.avatarImage : ''}`}
            style={profile.avatar_url ? { backgroundImage: `url("${profile.avatar_url}")` } : undefined}
          >
            {!profile.avatar_url && initial}
          </div>
          <h2>{profile.name || 'User'}</h2>
          <p>{profile.email}</p>
          <span>{profile.designation || roleLabel}</span>
          <strong>{roleLabel}</strong>
        </aside>

        <form className={styles.formPanel} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <h2>Profile Details</h2>
            <span>{roleLabel}</span>
          </div>

          <label>
            Full name
            <input name="name" value={profile.name} onChange={handleChange} required />
          </label>

          <label>
            Email
            <input type="email" name="email" value={profile.email} onChange={handleChange} required />
          </label>

          <label>
            Designation
            <input name="designation" value={profile.designation} onChange={handleChange} placeholder="Co-Founder, Team Lead, Agent" />
          </label>

          <label>
            Profile picture URL
            <input
              type="url"
              name="avatar_url"
              value={profile.avatar_url}
              onChange={handleChange}
              placeholder="https://example.com/profile.jpg"
            />
          </label>

          <div className={styles.actions}>
            <button type="button" className={styles.secondaryBtn} onClick={loadProfile}>Reset</button>
            <button type="submit" className={styles.primaryBtn} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
