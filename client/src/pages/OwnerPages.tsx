import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Banknote, ClipboardList, Users, MessageSquareText } from 'lucide-react';
import { api, patch, post } from '../lib/api';

const money=(n:number)=>new Intl.NumberFormat('vi-VN').format(n)+'đ';
type OwnerSummary={total:number;confirmed:number;checked_in:number;paid_revenue:number;total_staff:number;pending_refunds:number};
type Staff={id:number;full_name:string;email:string;role:string;active:boolean;created_at:string};
type Refund={id:number;booking_code:string;customer_name:string;requested_by_name:string;reason:string;amount_vnd:number;status:string;created_at:string};
type Audit={id:number;user_id:number|null;action:string;entity_type:string;entity_id:string;details:Record<string,unknown>|null;created_at:string;full_name:string|null;actor_email:string|null;actor_role:'EMPLOYEE'|'OWNER'|null};
const AUDIT_ACTION_NAMES:Record<string,string>={
  APPROVE_RESCHEDULE:'Duyệt đổi lịch', REJECT_RESCHEDULE:'Từ chối đổi lịch',
  APPROVE_CANCELLATION:'Duyệt hủy đơn', REJECT_CANCELLATION:'Từ chối hủy đơn',
  CANCEL_BOOKING:'Hủy đơn', REQUEST_REFUND:'Gửi yêu cầu hoàn tiền',
  APPROVE_REFUND:'Phê duyệt hoàn tiền', REJECT_REFUND:'Từ chối hoàn tiền',
  CHECK_IN:'Check-in', LOGIN:'Đăng nhập', CREATE_STAFF:'Thêm nhân viên', UPDATE_STAFF_STATUS:'Cập nhật nhân viên'
};

type PaymentReview={id:number;booking_code:string;issue_type:string;observed_amount_vnd:number;expected_amount_vnd:number;source:string;transaction_ref:string;created_at:string};

type ReminderRow={id:number;booking_code:string;due_at:string;status:string;attempts:number;sent_at:string|null;error_message:string|null};

export function OwnerDashboardPage(){
  const [data,setData]=useState<OwnerSummary|null>(null);const [error,setError]=useState('');const [reminders,setReminders]=useState<ReminderRow[]>([]);const [paymentReviews,setPaymentReviews]=useState<PaymentReview[]>([]);const [reviewError,setReviewError]=useState('');
  useEffect(()=>{api<OwnerSummary>('/owner/summary').then(setData).catch(e=>setError(e.message));api<ReminderRow[]>('/owner/sms-reminders').then(setReminders).catch(()=>{});api<PaymentReview[]>('/owner/payment-reviews').then(setPaymentReviews).catch(e=>setReviewError(e instanceof Error?e.message:'Không tải được danh sách đối soát.'));},[]);
  return <><div className="content-heading"><div><span className="eyebrow">OWNER WORKSPACE</span><h1>Tổng quan cửa hàng</h1><p>Quản lý hoạt động, nhân sự và các quyết định cần chủ quán phê duyệt.</p></div></div>{error&&<div className="error-box">{error}</div>}<div className="stats-grid"><article className="stat-card"><div className="stat-icon green"><ClipboardList/></div><small>Tổng đơn đặt</small><strong>{data?.total??'—'}</strong></article><article className="stat-card"><div className="stat-icon blue"><Activity/></div><small>Đơn xác nhận</small><strong>{data?.confirmed??'—'}</strong></article><article className="stat-card"><div className="stat-icon purple"><Users/></div><small>Nhân viên đang hoạt động</small><strong>{data?.total_staff??'—'}</strong></article><article className="stat-card"><div className="stat-icon amber"><Banknote/></div><small>Doanh thu đã thanh toán</small><strong>{data?money(data.paid_revenue):'—'}</strong></article></div><div className="notice notice-info">Có <strong>{data?.pending_refunds??0}</strong> yêu cầu hoàn tiền đang chờ phê duyệt. <Link to="/chu-quan/hoan-tien">Xem yêu cầu</Link></div><div className="notice notice-info"><MessageSquareText size={18}/> Nhắc lịch SMS (chỉ gửi thật khi đã cấu hình dịch vụ): {reminders.filter(r=>r.status==='PENDING').length} chờ gửi, {reminders.filter(r=>r.status==='SUBMITTED').length} đã được nhà cung cấp tiếp nhận, {reminders.filter(r=>r.status==='FAILED').length} thất bại. Trạng thái tiếp nhận không bảo đảm điện thoại đã nhận được SMS.</div>{(paymentReviews.length>0 || reviewError) && <section className="panel table-panel" aria-label="Các thanh toán cần đối soát"><h3>Thanh toán cần chủ quán đối soát</h3><p>Đã nhận sự kiện payOS nhưng chưa thể xác nhận chỗ. Không tự hoàn tiền hoặc khôi phục phòng.</p>{reviewError&&<div className="error-box">{reviewError}</div>}{paymentReviews.length>0&&<div className="table-scroll"><table><thead><tr><th>Mã đặt</th><th>Vấn đề</th><th>Tiền nhận</th><th>Tiền theo đơn</th><th>Nguồn</th></tr></thead><tbody>{paymentReviews.slice(0,15).map(item=><tr key={item.id}><td><strong>{item.booking_code}</strong></td><td>{item.issue_type==='AMOUNT_MISMATCH'?'Sai số tiền':'Đến muộn / đơn không hợp lệ'}</td><td>{money(item.observed_amount_vnd)}</td><td>{money(item.expected_amount_vnd)}</td><td>{item.source}</td></tr>)}</tbody></table></div>}<small>Danh sách chỉ để kiểm tra; quyết định hoàn tiền thực tế cần quy trình phê duyệt riêng.</small></section>}<div className="quick-grid"><Link className="quick-card" to="/chu-quan/don-dat"><ClipboardList/><strong>Danh sách đơn đặt</strong><span>Truy cập màn hình vận hành để xem và kiểm tra đơn.</span></Link><Link className="quick-card" to="/chu-quan/hoan-tien"><Banknote/><strong>Duyệt hoàn tiền</strong><span>Kiểm tra lý do, số tiền và quyết định phê duyệt.</span></Link><Link className="quick-card" to="/chu-quan/nhat-ky"><Activity/><strong>Nhật ký hệ thống</strong><span>Truy vết các thao tác quản trị quan trọng.</span></Link></div></>;
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
  const [rows,setRows]=useState<Audit[]>([]);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  useEffect(()=>{api<Audit[]>('/owner/audit').then(setRows).catch(e=>setError(e instanceof Error?e.message:'Không tải được nhật ký.'));},[]);
  const results=rows.filter(row=>{
    const detail=row.details || {};
    const search=[row.full_name,row.actor_email,row.action,AUDIT_ACTION_NAMES[row.action],
      row.entity_type,row.entity_id,detail.bookingCode].map(x=>String(x??'')).join(' ').toLocaleLowerCase('vi-VN');
    return search.includes(query.trim().toLocaleLowerCase('vi-VN'));
  });
  return <>
    <div className="content-heading"><div><span className="eyebrow">AUDIT LOG</span><h1>Nhật ký hệ thống</h1><p>Theo dõi nhân viên xử lý đổi lịch, hủy đơn, check-in và các quyết định hoàn tiền.</p></div></div>
    {error&&<div className="error-box">{error}</div>}
    <div className="panel"><label>Tìm nhân viên hoặc mã đặt phòng
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Tên nhân viên, email, mã đơn hoặc hành động" />
    </label></div>
    <div className="panel table-panel"><div className="table-scroll"><table>
      <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Chi tiết</th></tr></thead>
      <tbody>{results.map(row=><tr key={row.id}>
        <td>{new Date(row.created_at).toLocaleString('vi-VN')}</td>
        <td><strong>{row.full_name || (row.user_id ? `Tài khoản #${row.user_id}` : 'Khách / Hệ thống')}</strong>
          {row.actor_role&&<small>{row.actor_role==='EMPLOYEE'?'Nhân viên':'Chủ quán'}</small>}
          {row.actor_email&&<small>{row.actor_email}</small>}
        </td>
        <td><strong>{AUDIT_ACTION_NAMES[row.action]||row.action}</strong></td>
        <td>{row.entity_type} #{row.entity_id}</td>
        <td><code>{String(row.details?.bookingCode||'')}</code><small>{JSON.stringify(row.details||{})}</small></td>
      </tr>)}{!results.length&&<tr><td colSpan={5} className="empty-cell">Không tìm thấy nhật ký phù hợp.</td></tr>}</tbody>
    </table></div></div>
  </>;
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

