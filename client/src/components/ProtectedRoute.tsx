import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../context/AuthContext';

export function ProtectedRoute({ roles }: { roles: Role[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'OWNER' ? '/chu-quan' : '/nhan-vien'} replace />;
  return <Outlet/>;
}
