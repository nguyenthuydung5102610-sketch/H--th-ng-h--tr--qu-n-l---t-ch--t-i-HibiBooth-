import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Banknote, ClipboardList, Users, MessageSquareText } from 'lucide-react';
import { api, patch, post } from '../lib/api';

const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+'đ';
type OwnerSummary={total:number;confirmed:number;checked_in:number;paid_revenue:number;total_staff:number;pending_refunds:number};
type Staff={id:number;full_name:string;email:string;role:string;active:boolean;created_at:string};
type Refund={id:number;booking_code:string;customer_name:string;requested_by_name:string;reason:string;amount_vnd:number;status:string;created_at:string};
type Audit={id:number;action:string;entity_type:string;entity_id:string;details:Record<string,unknown>;created_at:string;full_name:string|null};

type ReminderRow={id:number;booking_code:string;due_at:string;status:string;attempts:number;sent_at:string|null;error_message:string|null};

export function OwnerDashboardPage(){
  const [data,setData]=useState<OwnerSummary|null>(null);const [error,setError]=useState('');const [reminders,setReminders]=useState<ReminderRow[]>([]);
  useEffect(()=>{api<OwnerSummary>('/owner/summary').then(setData).catch(e=>setError(e.message));api<ReminderRow[]>('/owner/sms-reminders').then(setReminders).catch(()=>{});},[]);
  return <><div className="content-heading"><div><span className="eyebrow">OWNER WORKSPACE</span><h1>Tổng quan cửa hàng</h1><p>Quản lý hoạt động, nhân sự và các quyết định cần chủ quán phê duyệt.</p></div></div>{error&&<div className="error-box">{error}</div>}<div className="stats-grid"><article className="stat-card"><div className="stat-icon green"><ClipboardList/></div><small>Tổng đơn đặt</small><strong>{data?.total??'—'}</strong></article><article className="stat-card"><div className="stat-icon blue"><Activity/></div><small>Đơn xác nhận</small><strong>{data?.confirmed??'—'}</strong></article><article className="stat-card"><div className="stat-icon purple"><Users/></div><small>Nhân viên đang hoạt động</small><strong>{data?.total_staff??'—'}</strong></article><article className="stat-card"><div className="stat-icon amber"><Banknote/></div><small>Doanh thu đã thanh toán</small><strong>{data?money(data.paid_revenue):'—'}</strong></article></div><div className="notice notice-info">Có <strong>{data?.pending_refunds??0}</strong> yêu cầu hoàn tiền đang chờ phê duyệt. <Link to="/chu-quan/hoan-tien">Xem yêu cầu</Link></div><div className="notice notice-info"><MessageSquareText size={18}/> Nhắc lịch SMS (chỉ gửi thật khi đã cấu hình dịch vụ): {reminders.filter(r=>r.status==='PENDING').length} chờ gửi, {reminders.filter(r=>r.status==='SUBMITTED').length} đã được nhà cung cấp tiếp nhận, {reminders.filter(r=>r.status==='FAILED').length} thất bại. Trạng thái tiếp nhận không bảo đảm điện thoại đã nhận được SMS.</div><div className="quick-grid"><Link className="quick-card" to="/chu-quan/don-dat"><ClipboardList/><strong>Danh sách đơn đặt</strong><span>Truy cập màn hình vận hành để xem và kiểm tra đơn.</span></Link><Link className="quick-card" to="/chu-quan/hoan-tien"><Banknote/><strong>Duyệt hoàn tiền</strong><span>Kiểm tra lý do, số tiền và quyết định phê duyệt.</span></Link><Link className="quick-card" to="/chu-quan/nhat-ky"><Activity/><strong>Nhật ký hệ thống</strong><span>Truy vết các thao tác quản trị quan trọng.</span></Link></div></>;
}

export function OwnerStaffPage(){
  const [rows,setRows]=useState<Staff[]>([]);const [fullName,setFullName]=useState('');const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function load(){try{setRows(await api<Staff[]>('/owner/staff'));}catch(e){setError(e instanceof Error?e.message:'Không tải được nhân viên.');}}
  useEffect(()=>{void load();},[]);
  async function create(event:FormEvent){event.preventDefault();setError('');setMessage('');try{await post('/owner/staff',{fullName,email,password});setFullName('');setEmail('');setPassword('');setMessage('Đã tạo tài khoản nhân viên.');await load();}catch(e){setError(e instanceof Error?e.message:'Không tạo được tài khoản.');}}
  async function toggle(row:Staff){setError('');setMessage('');try{await patch(`/owner/staff/${row.id}/active`,{active:!row.active});setMessage(`Đã ${row.active?'khóa':'mở khóa'} tài khoản ${row.email}.`);await load();}catch(e){setError(e instanceof Error?e.message:'Không cập nhật được tài khoản.');}}
  return <><div className="content-heading"><div><span className="eyebrow">TEAM MANAGEMENT</span><h1>Quản lý nhân viên</h1><p>Chỉ chủ quán được tạo, khóa hoặc mở tài khoản nhân viên.</p></div></div>{error&&<div className="error-box">{error}</div>}{message&&<div className="notice">{message}</div>}<div className="owner-two-col"><form className="panel" onSubmit={create}><h3>Tạo tài khoản nhân viên</h3><label>Họ và tên<input value={fullName} onChange={e=>setFullName(e.target.value)} required maxLength={120}/></label><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Mật khẩu tạm<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={10} required/><small className="field-hint">Tối thiểu 10 ký tự. Nhân viên nên đổi mật khẩu sau lần đăng nhập đầu.</small></label><button className="button primary full">Tạo nhân viên</button></form><div className="panel table-panel"><h3>Danh sách tài khoản</h3><div className="table-scroll"><table><thead><tr><th>Nhân viên</th><th>Vai trò</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.full_name}</strong><small>{row.email}</small></td><td>{row.role==='OWNER'?'Chủ quán':'Nhân viên'}</td><td>{row.active?'Đang hoạt động':'Đã khóa'}</td><td>{row.role==='EMPLOYEE'&&<button className="button tiny light" onClick={()=>toggle(row)}>{row.active?'Khóa':'Mở khóa'}</button>}</td></tr>)}</tbody></table></div></div></div></>;
}

export function OwnerRefundsPage(){
  const [rows,setRows]=useState<Refund[]>([]);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function load(){try{setRows(await api<Refund[]>('/owner/refunds'));}catch(e){setError(e instanceof Error?e.message:'Không tải được yêu cầu.');}}
  useEffect(()=>{void load();},[]);
  async function decide(row:Refund,decision:'APPROVE'|'REJECT'){
    const confirmText=decision==='APPROVE'?'Phê duyệt':'Từ chối';if(!window.confirm(`${confirmText} yêu cầu hoàn tiền ${row.booking_code} (${money(row.amount_vnd)})?`))return;
    setError('');setMessage('');try{const result=await patch<{message:string}>(`/owner/refunds/${row.id}/decision`,{decision});setMessage(result.message);await load();}catch(e){setError(e instanceof Error?e.message:'Không cập nhật được yêu cầu.');}
  }
  return <><div className="content-heading"><div><span className="eyebrow">REFUND APPROVAL</span><h1>Phê duyệt hoàn tiền</h1><p>Kiểm tra thông tin và quyết định trước khi thực hiện giao dịch hoàn tiền thật.</p></div></div>{error&&<div className="error-box">{error}</div>}{message&&<div className="notice">{message}</div>}<div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Mã đặt</th><th>Khách hàng</th><th>Lý do</th><th>Số tiền</th><th>Nhân viên gửi</th><th>Trạng thái</th><th>Quyết định</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.booking_code}</strong></td><td>{row.customer_name}</td><td>{row.reason}</td><td>{money(row.amount_vnd)}</td><td>{row.requested_by_name}</td><td>{row.status}</td><td>{row.status==='PENDING_APPROVAL'&&<div className="table-actions"><button className="button tiny primary" onClick={()=>decide(row,'APPROVE')}>Duyệt</button><button className="button tiny light" onClick={()=>decide(row,'REJECT')}>Từ chối</button></div>}</td></tr>)}{!rows.length&&<tr><td colSpan={7} className="empty-cell">Chưa có yêu cầu hoàn tiền.</td></tr>}</tbody></table></div></div><div className="notice notice-info">Phê duyệt ở đây chỉ ghi nhận quyết định và chuyển trạng thái sang REFUND_PENDING. Muốn chuyển tiền thật cần tích hợp API hoàn tiền của cổng thanh toán, xác thực chữ ký webhook và đối soát giao dịch.</div></>;
}

export function OwnerAuditPage(){
  const [rows,setRows]=useState<Audit[]>([]);const [error,setError]=useState('');
  useEffect(()=>{api<Audit[]>('/owner/audit').then(setRows).catch(e=>setError(e.message));},[]);
  return <><div className="content-heading"><div><span className="eyebrow">AUDIT LOG</span><h1>Nhật ký hệ thống</h1><p>Lịch sử đăng nhập, check-in, hủy đơn, tạo nhân viên và phê duyệt hoàn tiền.</p></div></div>{error&&<div className="error-box">{error}</div>}<div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString('vi-VN')}</td><td>{row.full_name||'Khách / Hệ thống'}</td><td><strong>{row.action}</strong></td><td>{row.entity_type} #{row.entity_id}</td><td><code>{JSON.stringify(row.details)}</code></td></tr>)}{!rows.length&&<tr><td colSpan={5} className="empty-cell">Chưa có nhật ký.</td></tr>}</tbody></table></div></div></>;
}
export function OwnerBookingsPage() {
  type BookingRow = {
    id: number;
    booking_code: string;
    customer_name: string;
    customer_phone: string;
    booking_date: string;
    time_slot: string;
    room_name: string;
    package_name: string;
    amount_vnd: number;
    status: string;
    payment_status: string;
  };

  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    api<BookingRow[]>('/owner/bookings')
      .then(setBookings)
      .catch(e => setError(e.message));
  }, []);

  const filtered = bookings.filter(b =>
    [b.booking_code, b.customer_name, b.customer_phone]
      .some(v => v.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <section>
      <div className="content-heading">
        <div>
          <span className="eyebrow">OWNER WORKSPACE</span>
          <h1>Danh sách đặt phòng</h1>
          <p>Theo dõi các đơn đặt phòng của HIBI.</p>
        </div>
      </div>

      <div className="panel">
        <label>
          Tìm kiếm đơn đặt phòng
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Mã đơn, tên khách hoặc số điện thoại"
          />
        </label>

        {error && <div className="error-box">{error}</div>}

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Mã đặt phòng</th>
                <th>Khách hàng</th>
                <th>Phòng</th>
                <th>Ngày</th>
                <th>Giờ</th>
                <th>Số tiền</th>
                <th>Thanh toán</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(b => (
                <tr key={b.id}>
                  <td>{b.booking_code}</td>
                  <td>
                    {b.customer_name}
                    <div>{b.customer_phone}</div>
                  </td>
                  <td>{b.room_name}</td>
                  <td>{String(b.booking_date).slice(0, 10)}</td>
                  <td>{b.time_slot}</td>
                  <td>{money(b.amount_vnd)}</td>
                  <td>{b.payment_status}</td>
                  <td>{b.status}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>Không có đơn phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

