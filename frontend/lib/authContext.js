'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext(null);

const API_BASE = '/api';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

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
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');

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
      fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.ok) {
          return res.json();
        }
        throw new Error('Auth check failed');
      })
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
