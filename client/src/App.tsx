import { Navigate, Route, Routes } from 'react-router-dom';
import { CustomerLayout, AdminLayout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage, BookingPage, LookupPage, LoginPage } from './pages/PublicPages';
import { StaffDashboardPage, StaffBookingsPage, StaffCheckinPage, StaffRefundsPage } from './pages/StaffPages';
import {
  OwnerDashboardPage,
  OwnerBookingsPage,
  OwnerStaffPage,
  OwnerRefundsPage,
  OwnerAuditPage
} from './pages/OwnerPages';
import { useAuth } from './context/AuthContext';

function NotFound() {
  return <div className="narrow-page panel"><h1>Không tìm thấy trang</h1><p>Đường dẫn có thể đã thay đổi.</p><a className="button primary" href="/">Về trang chủ</a></div>;
}
function RootRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace/>;
  return <Navigate to={user.role === 'OWNER' ? '/chu-quan' : '/nhan-vien'} replace/>;
}

export default function App() {
  return <Routes>
    <Route element={<CustomerLayout/>}>
      <Route path="/" element={<HomePage/>}/>
      <Route path="/dat-lich" element={<BookingPage/>}/>
      <Route path="/tra-cuu" element={<LookupPage/>}/>
    </Route>
    <Route path="/dang-nhap" element={<LoginPage/>}/>

    <Route element={<ProtectedRoute roles={['EMPLOYEE']}/> }>
      <Route path="/nhan-vien" element={<AdminLayout/>}>
        <Route index element={<StaffDashboardPage/>}/>
        <Route path="don-dat" element={<StaffBookingsPage/>}/>
        <Route path="check-in" element={<StaffCheckinPage/>}/>
        <Route path="hoan-tien" element={<StaffRefundsPage/>}/>
      </Route>
    </Route>

    <Route element={<ProtectedRoute roles={['OWNER']}/> }>
      <Route path="/chu-quan" element={<AdminLayout owner/>}>
        <Route path="don-dat" element={<OwnerBookingsPage/>}/>
        <Route index element={<OwnerDashboardPage/>}/>
        <Route path="nhan-vien" element={<OwnerStaffPage/>}/>
        <Route path="hoan-tien" element={<OwnerRefundsPage/>}/>
        <Route path="nhat-ky" element={<OwnerAuditPage/>}/>
      </Route>
    </Route>
    <Route path="/redirect" element={<RootRedirect/>}/>
    <Route path="*" element={<NotFound/>}/>
  </Routes>;
}
