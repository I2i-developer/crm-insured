'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const applyUser = (user) => {
    setProfile({
      name: user.name || '',
      email: user.email || '',
      designation: user.designation || '',
      avatar_url: user.avatar_url || ''
    });
    setRole(user.role || 'team_member');
    localStorage.setItem('user', JSON.stringify(user));
    window.dispatchEvent(new Event('crm-user-updated'));
  };

  const loadProfile = async () => {
    try {
      const data = await api.get('/auth/me');
      applyUser(data.user);
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

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Upload a JPG, PNG, WEBP, or GIF image.');
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Profile image must be 2MB or smaller.');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);
    setUploading(true);
    try {
      const data = await api.upload('/auth/avatar', formData);
      applyUser(data.user);
      toast.success('Profile image uploaded successfully.');
    } catch (error) {
      toast.error(error.message || 'Failed to upload profile image.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    setProfile(current => ({ ...current, avatar_url: '' }));
    toast.info('Profile picture removed from the form. Save changes to update your account.');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await api.put('/auth/me', profile);
      applyUser(data.user);
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
          <p>Manage your profile picture, identity, and CRM account details.</p>
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
          <strong>{roleLabel}</strong>

          <div className={styles.avatarActions}>
            <input
              ref={fileInputRef}
              className={styles.fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleAvatarFile}
            />
            <button type="button" className={styles.primaryBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading...' : 'Upload Image'}
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={handleRemoveAvatar} disabled={!profile.avatar_url || uploading}>
              Remove
            </button>
          </div>
        </aside>

        <form className={styles.formPanel} onSubmit={handleSubmit}>
          <div className={styles.formHeader}>
            <h2>Profile Details</h2>
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
              placeholder="Upload an image or paste an https image URL"
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
