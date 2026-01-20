import React from 'react';

interface User {
  id: number;
  email: string;
  name: string | null;
  role: string;
  organization: {
    id: number;
    name: string;
    slug: string;
  };
}

// Simple auth store without external dependencies
let authState: {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isLoading: boolean;
} = {
  user: null,
  token: null,
  refreshToken: null,
  isLoading: true,
};

const listeners: Set<() => void> = new Set();

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem('auth');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      authState = { ...authState, ...parsed, isLoading: false };
    } catch {
      authState.isLoading = false;
    }
  } else {
    authState.isLoading = false;
  }
}

export function useAuth() {
  const [, forceUpdate] = React.useState({});

  React.useEffect(() => {
    const listener = () => forceUpdate({});
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setAuth = (user: User, token: string, refreshToken: string) => {
    authState = { user, token, refreshToken, isLoading: false };
    localStorage.setItem(
      'auth',
      JSON.stringify({ user, token, refreshToken })
    );
    notifyListeners();
  };

  const logout = async () => {
    try {
      if (authState.token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${authState.token}`,
          },
        });
      }
    } catch {
      // Ignore errors
    }
    authState = { user: null, token: null, refreshToken: null, isLoading: false };
    localStorage.removeItem('auth');
    notifyListeners();
    window.location.href = '/login';
  };

  return {
    user: authState.user,
    token: authState.token,
    isLoading: authState.isLoading,
    isAuthenticated: !!authState.user,
    setAuth,
    logout,
  };
}
