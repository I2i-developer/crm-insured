'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

function getApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_URL || '';
  const isLocalBrowser = typeof window !== 'undefined'
    && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

  if (isLocalBrowser) return '/api';
  if (!configured) return '/api';

  const trimmed = configured.replace(/\/$/, '');
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith('/')
    ? trimmed
    : `https://${trimmed}`;
}

function getApiUrl(endpoint) {
  const base = getApiBase();
  return base.endsWith('/api') ? `${base}${endpoint}` : `${base}/api${endpoint}`;
}

async function readApiResponse(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'API request failed');
    return data;
  }

  const text = await response.text();
  const isHtml = text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html');
  const message = isHtml
    ? 'Login API returned an HTML page instead of JSON. Check that NEXT_PUBLIC_API_URL points to this app and that /api/auth/login exists.'
    : text || 'API request failed';

  throw new Error(message);
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async (email, password) => {
    const res = await fetch(getApiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await readApiResponse(res);

    const userData = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role || 'team_member',
      avatar_url: data.user.avatar_url || '',
      designation: data.user.designation || ''
    };

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(userData));
    sessionStorage.setItem('justLoggedIn', 'true');
    setUser(userData);

    return data;
  };

  const register = async (email, password, name) => {
    const res = await fetch(getApiUrl('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await readApiResponse(res);

    const userData = {
      id: data.user.id,
      email: data.user.email,
      name: data.user.name,
      role: data.user.role || 'team_member',
      avatar_url: data.user.avatar_url || '',
      designation: data.user.designation || ''
    };

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(userData));
    sessionStorage.setItem('justLoggedIn', 'true');
    setUser(userData);

    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('justLoggedIn');
    setUser(null);
    router.push('/login');
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    const justLoggedIn = sessionStorage.getItem('justLoggedIn');

    if (token && userStr) {
      const userData = JSON.parse(userStr);

      if (justLoggedIn) {
        sessionStorage.removeItem('justLoggedIn');
        setUser(userData);
        return;
      }

      setLoading(true);
      fetch(getApiUrl('/auth/me'), {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(readApiResponse)
      .then(data => {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
