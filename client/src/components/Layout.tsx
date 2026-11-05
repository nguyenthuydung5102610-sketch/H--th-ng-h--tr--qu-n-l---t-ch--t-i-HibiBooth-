import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Camera, ShieldCheck, LogOut, LayoutDashboard, ClipboardList, ScanLine, Wallet, Users, ScrollText, CalendarClock, CalendarX2, Menu, X } from 'lucide-react';
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

type AdminNavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};
type AdminNavGroup = { title: string; items: AdminNavItem[] };

const STAFF_GROUPS: AdminNavGroup[] = [
  {title: 'TỔNG QUAN', items: [
    {to:'/nhan-vien',label:'Bảng điều khiển',icon:LayoutDashboard,end:true},
  ]},
  {title: 'VẬN HÀNH', items: [
    {to:'/nhan-vien/don-dat',label:'Đơn đặt phòng',icon:ClipboardList},
    {to:'/nhan-vien/check-in',label:'Check-in QR',icon:ScanLine},
  ]},
  {title: 'XỬ LÝ YÊU CẦU', items: [
    {to:'/nhan-vien/doi-lich',label:'Yêu cầu đổi lịch',icon:CalendarClock},
    {to:'/nhan-vien/huy-lich',label:'Yêu cầu hủy đơn',icon:CalendarX2},
    {to:'/nhan-vien/hoan-tien',label:'Gửi yêu cầu hoàn tiền',icon:Wallet},
  ]},
];
const OWNER_GROUPS: AdminNavGroup[] = [
  {title: 'TỔNG QUAN', items: [
    {to:'/chu-quan',label:'Bảng điều khiển',icon:LayoutDashboard,end:true},
  ]},
  {title: 'ĐẶT PHÒNG', items: [
    {to:'/chu-quan/don-dat',label:'Danh sách đặt phòng',icon:ClipboardList},
  ]},
  {title: 'PHÊ DUYỆT', items: [
    {to:'/chu-quan/hoan-tien',label:'Phê duyệt hoàn tiền',icon:Wallet},
  ]},
  {title: 'QUẢN TRỊ', items: [
    {to:'/chu-quan/nhan-vien',label:'Nhân viên',icon:Users},
    {to:'/chu-quan/nhat-ky',label:'Nhật ký hệ thống',icon:ScrollText},
  ]},
];

export function AdminLayout({ owner = false }: { owner?: boolean }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const groups = owner ? OWNER_GROUPS : STAFF_GROUPS;
  const base = owner ? '/chu-quan' : '/nhan-vien';
  const closeMenu = () => setMenuOpen(false);

  return <div className="admin-shell">
    <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="admin-sidebar-header">
        <Link className="brand admin-brand" to={base} onClick={closeMenu}>
          <span className="brand-mark"><Camera size={20}/></span>
          <span>HIBI BOOTH<small>{owner ? 'QUẢN TRỊ CỬA HÀNG' : 'VẬN HÀNH CỬA HÀNG'}</small></span>
        </Link>
        <button type="button" className="admin-menu-toggle" aria-label={menuOpen ? 'Đóng menu quản trị' : 'Mở menu quản trị'}
          aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(value => !value)}>
          {menuOpen ? <X size={21}/> : <Menu size={21}/>}
        </button>
      </div>
      <div className="sidebar-navigation" id="admin-navigation">
        <nav className="side-nav" aria-label={owner ? 'Điều hướng chủ quán' : 'Điều hướng nhân viên'}>
          {groups.map(group => <div className="side-nav-group" key={group.title}>
            <div className="side-nav-group-heading">{group.title}</div>
            {group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMenu}>
              <item.icon size={18} aria-hidden="true"/><span>{item.label}</span>
            </NavLink>)}
          </div>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-chip"><div className="avatar">{user?.fullName?.slice(0,1) || 'H'}</div>
            <div><strong>{user?.fullName}</strong><small>{owner ? 'Chủ quán' : 'Nhân viên'}</small></div>
          </div>
          <button type="button" className="button ghost full" onClick={() => { logout(); closeMenu(); navigate('/dang-nhap'); }}>
            <LogOut size={16}/> Đăng xuất
          </button>
        </div>
      </div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><span>{owner ? 'Quản trị cửa hàng' : 'Vận hành cửa hàng'}</span>
        <span className="topbar-pill"><ShieldCheck size={15}/> {owner ? 'Chủ quán' : 'Nhân viên'}</span></header>
      <div className="admin-content"><Outlet/></div>
    </main>
  </div>;
}
