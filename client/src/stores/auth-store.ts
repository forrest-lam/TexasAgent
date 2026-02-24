import { create } from 'zustand';
import { AuthResponse } from '@texas-agent/shared';

const API_BASE = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

interface AuthState {
  token: string | null;
  user: AuthResponse['user'] | null;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  restoreSession: () => Promise<void>;
  updateUser: (user: AuthResponse['user']) => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem('token'),
  user: null,
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Login failed', isLoading: false });
        return false;
      }
      localStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, isLoading: false });
      return true;
    } catch {
      set({ error: 'Network error', isLoading: false });
      return false;
    }
  },

  register: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({ error: data.error || 'Registration failed', isLoading: false });
        return false;
      }
      localStorage.setItem('token', data.token);
      set({ token: data.token, user: data.user, isLoading: false });
      return true;
    } catch {
      set({ error: 'Network error', isLoading: false });
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ token: null, user: null });
  },

  restoreSession: async () => {
    const token = get().token;
    if (!token) return;
    set({ isLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        localStorage.removeItem('token');
        set({ token: null, user: null, isLoading: false });
        return;
      }
      const data = await res.json();
      set({ user: data.user, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  updateUser: (user) => set({ user }),
  clearError: () => set({ error: null }),
}));
