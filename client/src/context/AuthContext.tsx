import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { post } from '../lib/api';

export type Role = 'EMPLOYEE' | 'OWNER';
export type User = { id: number; fullName: string; email: string; role: Role };
type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
};
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try { return JSON.parse(localStorage.getItem('hibi_user') || 'null') as User | null; }
    catch { return null; }
  });

  async function login(email: string, password: string) {
    const result = await post<{ token: string; user: User }>('/auth/login', { email, password });
    localStorage.setItem('hibi_token', result.token);
    localStorage.setItem('hibi_user', JSON.stringify(result.user));
    setUser(result.user);
    return result.user;
  }

  function logout() {
    localStorage.removeItem('hibi_token');
    localStorage.removeItem('hibi_user');
    setUser(null);
  }

  const value = useMemo(() => ({ user, login, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth phải được sử dụng bên trong AuthProvider.');
  return value;
}
