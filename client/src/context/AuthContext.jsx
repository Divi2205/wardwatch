// =====================================================================
// AuthContext : the logged-in user, shared with every component.
// useAuth() gives { user, loading, login, register, logout }.
// =====================================================================
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // On first load, ask the server who is logged in (session cookie)
  useEffect(() => {
    api('/api/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const { user } = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setUser(user);
    return user;
  }

  async function register(name, email, password) {
    const { user } = await api('/api/auth/register', { method: 'POST', body: { name, email, password } });
    setUser(user);
    return user;
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST' });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
