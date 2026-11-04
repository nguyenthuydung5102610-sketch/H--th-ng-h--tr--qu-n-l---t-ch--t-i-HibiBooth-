import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Camera, ClipboardList, Clock3, ScanLine, Search, ShieldAlert, Wallet } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { api, patch, post } from '../lib/api';

const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const statusName: Record<string,string> = { PENDING_PAYMENT:'Chờ thanh toán', CONFIRMED:'Đã xác nhận', CHECKED_IN:'Đã check-in', CANCELLED:'Đã hủy', EXPIRED:'Hết hạn' };
type Booking = { id:number; booking_code:string; customer_name:string; customer_phone:string; booking_date:string; time_slot:string; amount_vnd:number; status:string; payment_status:string; room_name:string; package_name:string };
type Refund = { id:number; booking_code:string; customer_name:string; requested_by_name:string; reason:string; amount_vnd:number; status:string; created_at:string };

function StatCard({ title, value, icon:Icon, tone='green' }: { title:string; value:string|number; icon:typeof CalendarCheck; tone?:string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><small>{title}</small><strong>{value}</strong></article>;
}

export function StaffDashboardPage() {
  const [stats, setStats] = useState({today_total:0,awaiting_checkin:0,pending_payment:0,checked_in:0});
  const [error, setError] = useState('');
  useEffect(() => { api<typeof stats>('/staff/summary').then(setStats).catch((e)=>setError(e.message)); }, []);
  return <><div className="content-heading"><div><span className="eyebrow">STAFF WORKSPACE</span><h1>Tổng quan vận hành</h1><p>Theo dõi đơn đặt và hỗ trợ khách trong ngày.</p></div></div>
    {error && <div className="error-box">{error}</div>}
    <div className="stats-grid"><StatCard title="Lịch đã xác nhận hôm nay" value={stats.today_total} icon={CalendarCheck}/><StatCard title="Chờ check-in" value={stats.awaiting_checkin} icon={Clock3} tone="blue"/><StatCard title="Chờ thanh toán" value={stats.pending_payment} icon={Wallet} tone="amber"/><StatCard title="Đã check-in" value={stats.checked_in} icon={ClipboardList} tone="purple"/></div>
    <div className="quick-grid"><Link className="quick-card" to="/nhan-vien/don-dat"><ClipboardList/><strong>Quản lý đơn đặt</strong><span>Tìm kiếm, lọc, xem trạng thái đơn.</span></Link><Link className="quick-card" to="/nhan-vien/check-in"><ScanLine/><strong>Quét QR check-in</strong><span>Dùng camera hoặc nhập mã đặt phòng.</span></Link><Link className="quick-card" to="/nhan-vien/hoan-tien"><Wallet/><strong>Yêu cầu hoàn tiền</strong><span>Gửi yêu cầu để chủ quán phê duyệt.</span></Link></div>
    <div className="notice notice-info"><ShieldAlert size={18}/> Nhân viên có thể tạo yêu cầu hoàn tiền. Chủ quán là người phê duyệt; hệ thống hiện chưa kết nối ngân hàng/cổng thanh toán để chuyển tiền thật.</div>
  </>;
}

export function StaffBookingsPage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [status, setStatus] = useState('ALL');
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refundTarget, setRefundTarget] = useState<Booking|null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');

  async function load() {
    setError('');
    try { const params = new URLSearchParams(); if(status!=='ALL') params.set('status',status); if(date) params.set('date',date); if(query.trim()) params.set('q',query.trim()); setRows(await api<Booking[]>(`/staff/bookings?${params.toString()}`)); }
    catch(e) { setError(e instanceof Error?e.message:'Không tải được danh sách đơn.'); }
  }
  useEffect(()=>{ void load(); },[status,date]);
  async function doCheckin(row:Booking) {
    setError(''); setMessage('');
    try { const result=await post<{message:string}>(`/staff/check-in/${row.booking_code}`); setMessage(result.message); await load(); }
    catch(e){setError(e instanceof Error?e.message:'Check-in thất bại.');}
  }
  async function cancel(row:Booking) {
    if(!window.confirm(`Bạn chắc chắn muốn hủy đơn ${row.booking_code}?`)) return;
    setError('');setMessage('');
    try { const result=await post<{message:string}>(`/staff/bookings/${row.id}/cancel`);setMessage(result.message);await load(); }
    catch(e){setError(e instanceof Error?e.message:'Không thể hủy đơn.');}
  }
  async function submitRefund(event:FormEvent) {
    event.preventDefault(); if(!refundTarget) return;
    setError('');setMessage('');
    try { const result=await post<{message:string}>(`/staff/bookings/${refundTarget.id}/refunds`,{reason:refundReason,amountVnd:refundAmount?Number(refundAmount):refundTarget.amount_vnd});setMessage(result.message);setRefundTarget(null);setRefundReason('');setRefundAmount('');await load(); }
    catch(e){setError(e instanceof Error?e.message:'Không tạo được yêu cầu hoàn tiền.');}
  }
  return <><div className="content-heading"><div><span className="eyebrow">BOOKING MANAGEMENT</span><h1>Quản lý đơn đặt phòng</h1><p>Tra cứu toàn bộ đơn và thực hiện các thao tác theo quyền nhân viên.</p></div></div>
    <div className="panel filter-panel"><div className="filter-row"><label>Tìm mã / tên / SĐT<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="HB-... hoặc tên khách" onKeyDown={e=>e.key==='Enter'&&load()}/></label><label>Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">Tất cả</option>{Object.entries(statusName).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Ngày đặt<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><button className="button primary filter-button" onClick={load}><Search size={16}/> Tìm kiếm</button></div></div>
    {error&&<div className="error-box">{error}</div>}{message&&<div className="notice">{message}</div>}
    <div className="panel table-panel"><div className="table-title"><h3>Danh sách đơn</h3><span>{rows.length} kết quả</span></div><div className="table-scroll"><table><thead><tr><th>Mã đặt</th><th>Khách hàng</th><th>Lịch chụp</th><th>Phòng / Gói</th><th>Thanh toán</th><th>Trạng thái</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.booking_code}</strong><small>{money(row.amount_vnd)}</small></td><td>{row.customer_name}<small>{row.customer_phone}</small></td><td>{new Date(`${row.booking_date}T00:00:00`).toLocaleDateString('vi-VN')}<small>{row.time_slot}</small></td><td>{row.room_name}<small>{row.package_name}</small></td><td>{row.payment_status}</td><td><span className={`status status-${row.status.toLowerCase()}`}>{statusName[row.status]||row.status}</span></td><td><div className="table-actions">{row.status==='CONFIRMED'&&<button className="button tiny primary" onClick={()=>doCheckin(row)}>Check-in</button>}{row.status==='PENDING_PAYMENT'&&<button className="button tiny light" onClick={()=>cancel(row)}>Hủy</button>}{row.payment_status==='PAID'&&<button className="button tiny light" onClick={()=>{setRefundTarget(row);setRefundAmount(String(row.amount_vnd));}}>Hoàn tiền</button>}</div></td></tr>)}{rows.length===0&&<tr><td colSpan={7} className="empty-cell">Chưa có đơn phù hợp. Hãy tạo đơn từ khu vực khách hàng để thử.</td></tr>}</tbody></table></div></div>
    {refundTarget&&<div className="modal-backdrop"><form className="modal panel" onSubmit={submitRefund}><button type="button" className="modal-close" onClick={()=>setRefundTarget(null)}>×</button><span className="eyebrow">REFUND REQUEST</span><h2>Tạo yêu cầu hoàn tiền</h2><p>Đơn {refundTarget.booking_code} · {refundTarget.customer_name}</p><label>Lý do hoàn tiền<textarea value={refundReason} onChange={e=>setRefundReason(e.target.value)} required maxLength={500}/></label><label>Số tiền đề nghị hoàn<input type="number" min="1" max={refundTarget.amount_vnd} value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} required/></label><div className="notice notice-info">Yêu cầu sẽ chuyển đến chủ quán phê duyệt. Chưa có tiền được hoàn tự động.</div><button className="button primary full">Gửi yêu cầu</button></form></div>}
  </>;
}

function normalizeQr(value:string) {
  const trimmed=value.trim();
  if(trimmed.startsWith('HIBI|')) return trimmed.slice(5).toUpperCase();
  return trimmed.toUpperCase();
}

export function StaffCheckinPage() {
  const [cameraOpen,setCameraOpen]=useState(false);
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const scanBusyRef=useRef(false);
  useEffect(()=>{
    if(!cameraOpen) return;
    const scanner=new Html5QrcodeScanner('hibi-qr-reader',{fps:8,qrbox:{width:230,height:230},rememberLastUsedCamera:true},false);
    scanner.render((decodedText)=>{
      if (scanBusyRef.current) return;
      scanBusyRef.current=true;
      const scannedCode=normalizeQr(decodedText);
      setCode(scannedCode);
      setError('');setMessage('');setBusy(true);
      // Quét QR = check-in trực tiếp. Quét lại sau khi đã sử dụng sẽ hiện thông báo rõ ràng từ Backend.
      void post<{message:string}>(`/staff/check-in/${encodeURIComponent(scannedCode)}`)
        .then(result=>setMessage(result.message))
        .catch(e=>setError(e instanceof Error?e.message:'Không thể check-in bằng QR.'))
        .finally(()=>{setBusy(false);setCameraOpen(false);scanBusyRef.current=false;});
    },()=>{});
    return ()=>{void scanner.clear().catch(()=>undefined);};
  },[cameraOpen]);
  async function checkin(event:FormEvent) {
    event.preventDefault();setError('');setMessage('');setBusy(true);
    try{const result=await post<{message:string}>(`/staff/check-in/${encodeURIComponent(normalizeQr(code))}`);setMessage(result.message);}
    catch(e){setError(e instanceof Error?e.message:'Không thể check-in.');}
    finally{setBusy(false);}
  }
  return <><div className="content-heading"><div><span className="eyebrow">QR CHECK-IN</span><h1>Đón khách tại quầy.</h1><p>Quét QR để check-in tự động hoặc nhập mã rồi nhấn xác nhận. Quét lại mã đã check-in sẽ báo “Đơn đã được check-in”.</p></div></div>
    <div className="checkin-grid"><div className="panel scanner-panel"><div className="scanner-title"><ScanLine/><div><h3>Quét mã bằng camera</h3><p>Cho phép trình duyệt sử dụng camera khi được hỏi.</p></div></div><div id="hibi-qr-reader" className={cameraOpen?'qr-reader':'qr-reader hidden-reader'}></div>{!cameraOpen&&<div className="camera-placeholder"><Camera size={34}/><span>Camera đang tắt</span></div>}<button className={`button ${cameraOpen?'light':'primary'} full`} onClick={()=>setCameraOpen(v=>!v)}>{cameraOpen?'Đóng camera':'Bật camera quét QR'}</button><p className="tiny-note">Camera cần chạy trên localhost hoặc HTTPS. Nếu camera không hỗ trợ, nhập mã đặt phòng thủ công.</p></div>
    <div className="panel"><span className="eyebrow">MANUAL CHECK-IN</span><h3>Nhập mã đặt phòng</h3><form onSubmit={checkin}><label>Mã đặt phòng<input value={code} onChange={e=>setCode(e.target.value)} placeholder="HB-1004112006" required/></label><button className="button primary full" disabled={busy||!code.trim()}>{busy?'Đang đối chiếu...':'Xác nhận check-in'}</button></form>{error&&<div className="error-box">{error}</div>}{message&&<div className="notice">{message}</div>}<div className="notice notice-info">Check-in hợp lệ từ tối đa 30 phút trước giờ hẹn đến 20 phút sau giờ hẹn. Khi quét QR, hệ thống đối chiếu và check-in ngay; mã đã check-in không thể sử dụng lần thứ hai.</div></div></div>
  </>;
}

export function StaffRefundsPage() {
  const [rows,setRows]=useState<Refund[]>([]);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function load(){try{setRows(await api<Refund[]>('/staff/refunds'));}catch(e){setError(e instanceof Error?e.message:'Không tải được yêu cầu hoàn tiền.');}}
  useEffect(()=>{void load();},[]);
  return <><div className="content-heading"><div><span className="eyebrow">REFUND TRACKING</span><h1>Yêu cầu hoàn tiền</h1><p>Theo dõi yêu cầu hoàn tiền; chỉ chủ quán có quyền phê duyệt hoặc từ chối.</p></div></div>{error&&<div className="error-box">{error}</div>}{message&&<div className="notice">{message}</div>}<div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Mã đặt phòng</th><th>Khách hàng</th><th>Lý do</th><th>Số tiền</th><th>Người gửi</th><th>Trạng thái</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.booking_code}</strong></td><td>{row.customer_name}</td><td>{row.reason}</td><td>{money(row.amount_vnd)}</td><td>{row.requested_by_name}</td><td><span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span></td></tr>)}{!rows.length&&<tr><td colSpan={6} className="empty-cell">Chưa có yêu cầu hoàn tiền.</td></tr>}</tbody></table></div></div><div className="notice notice-info">Nhân viên chỉ gửi và theo dõi yêu cầu. Chủ quán phê duyệt; tiền chưa được hoàn cho đến khi hệ thống tích hợp thêm payout hoặc xác minh thủ công ngoài demo.</div></>;
}
