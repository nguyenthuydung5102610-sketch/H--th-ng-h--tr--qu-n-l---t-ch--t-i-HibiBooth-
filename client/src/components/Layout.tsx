import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Camera, CalendarDays, Search, ShieldCheck, LogOut, LayoutDashboard, ClipboardList, ScanLine, Wallet, Users, ScrollText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function CustomerLayout() {
  return <div className="site-shell">
    <header className="topbar"><Link className="brand" to="/"><span className="brand-mark"><img src="/hibi-icon-header.png" alt="Hibi Booth" style={{width:57,height:57,objectFit:"contain",borderRadius:12}}/></span><span>HIBI BOOTH<small>YOUR LITTLE MEMORY LAB</small></span></Link>
      <nav className="public-nav"><NavLink to="/">Trang chủ</NavLink><NavLink to="/dat-lich">Đặt lịch</NavLink><NavLink to="/tra-cuu">Tra cứu đơn</NavLink><Link className="nav-dark" to="/dang-nhap">Đăng nhập</Link></nav>
    </header>
    <main className="public-main"><Outlet/></main>
    <footer className="footer"><strong>HIBI BOOTH</strong><span>Đặt lịch trực tuyến · Tra cứu bằng mã đặt phòng</span></footer>
  </div>;
}

export function AdminLayout({ owner = false }: { owner?: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const staffLinks = [
    { to: '/nhan-vien', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    { to: '/nhan-vien/don-dat', label: 'Quản lý đơn', icon: ClipboardList },
    { to: '/nhan-vien/check-in', label: 'Quét QR check-in', icon: ScanLine },
    { to: '/nhan-vien/hoan-tien', label: 'Yêu cầu hoàn tiền', icon: Wallet },
  ];
  const ownerLinks = [
    { to: '/chu-quan', label: 'Tổng quan', icon: LayoutDashboard, end: true },
    { to: '/chu-quan/nhan-vien', label: 'Quản lý nhân viên', icon: Users },
    { to: '/chu-quan/hoan-tien', label: 'Duyệt hoàn tiền', icon: Wallet },
    { to: '/chu-quan/nhat-ky', label: 'Nhật ký hệ thống', icon: ScrollText },
    { to: '/chu-quan/don-dat',label: 'Danh sách đặt phòng',icon: ClipboardList},
  ];
  const links = owner ? ownerLinks : staffLinks;
  return <div className="admin-shell">
    <aside className="sidebar">
      <Link className="brand admin-brand" to={owner ? '/chu-quan' : '/nhan-vien'}><span className="brand-mark"><Camera size={20}/></span><span>HIBI BOOTH<small>{owner ? 'OWNER WORKSPACE' : 'STAFF WORKSPACE'}</small></span></Link>
      <div className="sidebar-label">KHÔNG GIAN LÀM VIỆC</div>
      <nav className="side-nav">{links.map((item) => <NavLink key={item.to} to={item.to} end={item.end}><item.icon size={18}/>{item.label}</NavLink>)}
      
      </nav>
      <div className="sidebar-bottom"><div className="user-chip"><div className="avatar">{user?.fullName?.slice(0,1) || 'H'}</div><div><strong>{user?.fullName}</strong><small>{owner ? 'Chủ quán' : 'Nhân viên'}</small></div></div><button className="button ghost full" onClick={() => { logout(); navigate('/dang-nhap'); }}><LogOut size={16}/> Đăng xuất</button></div>
    </aside>
    <main className="admin-main"><header className="admin-topbar"><span>{owner ? 'Quản trị cửa hàng' : 'Vận hành cửa hàng'}</span><span className="topbar-pill"><ShieldCheck size={15}/> Đã đăng nhập · {owner ? 'Chủ quán' : 'Nhân viên'}</span></header><div className="admin-content"><Outlet/></div></main>
  </div>;
}
