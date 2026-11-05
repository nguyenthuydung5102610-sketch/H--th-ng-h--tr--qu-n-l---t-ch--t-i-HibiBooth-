import { useEffect, useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Camera, ClipboardList, Clock3, ScanLine, Search, ShieldAlert, Wallet } from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { api, patch, post } from '../lib/api';

const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const statusName: Record<string,string> = { PENDING_PAYMENT:'Chờ thanh toán', CONFIRMED:'Đã xác nhận', CHECKED_IN:'Đã check-in', CANCELLED:'Đã hủy', EXPIRED:'Hết hạn', NO_SHOW:'Khách không đến' };
type Booking = { id:number; booking_code:string; customer_name:string; customer_phone:string; booking_date:string; time_slot:string; amount_vnd:number; status:string; payment_status:string; room_name:string; package_name:string; attendance_kind?:'LATE_ARRIVAL'|'NO_SHOW'|null;attendance_note?:string|null;attendance_eligible?:boolean };
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
  const [attendanceTarget, setAttendanceTarget] = useState<Booking|null>(null);
  const [attendanceOutcome, setAttendanceOutcome] = useState<'LATE_ARRIVAL'|'NO_SHOW'>('LATE_ARRIVAL');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [attendanceBusy,setAttendanceBusy]=useState(false);

  async function load() {
    setError('');
    try { const params = new URLSearchParams(); if(status!=='ALL') params.set('status',status); if(date) params.set('date',date); if(query.trim()) params.set('q',query.trim()); setRows(await api<Booking[]>(`/staff/bookings?${params.toString()}`)); }
    catch(e) { setError(e instanceof Error?e.message:'Không tải được danh sách đơn.'); }
  }
  useEffect(()=>{ void load(); },[status,date]);
  async function doCheckin(row:Booking) {
    setError(''); setMessage('');
    try { if (!window.confirm(`Đã đối chiếu khách và muốn check-in đơn ${row.booking_code}?`)) return; const result=await post<{message:string}>(`/staff/check-in/${row.booking_code}`); setMessage(result.message); await load(); }
    catch(e){setError(e instanceof Error?e.message:'Check-in thất bại.');}
  }
  async function cancel(row:Booking) {
    if(!window.confirm(`Bạn chắc chắn muốn hủy đơn ${row.booking_code}?`)) return;
    setError('');setMessage('');
    try { const result=await post<{message:string}>(`/staff/bookings/${row.id}/cancel`);setMessage(result.message);await load(); }
    catch(e){setError(e instanceof Error?e.message:'Không thể hủy đơn.');}
  }
  function openAttendance(row:Booking,outcome:'LATE_ARRIVAL'|'NO_SHOW') {
    setAttendanceTarget(row);setAttendanceOutcome(outcome);setAttendanceNote('');setError('');setMessage('');
  }
  async function submitAttendance(event:FormEvent) {
    event.preventDefault();
    if(!attendanceTarget||attendanceBusy||attendanceNote.trim().length<5||attendanceNote.trim().length>500)return;
    const booking=attendanceTarget;
    if(!window.confirm(attendanceOutcome==='NO_SHOW'
      ? `Xác nhận khách KHÔNG ĐẾN đơn ${booking.booking_code}? Suất đặt sẽ được giải phóng, nhưng không tự hoàn tiền.`
      : `Ghi nhận khách ĐẾN TRỄ cho đơn ${booking.booking_code}? Thao tác này không phải check-in.`))return;
    setError('');setMessage('');setAttendanceBusy(true);
    try{
      const result=await post<{message:string}>(`/staff/bookings/${booking.id}/attendance`,
        {outcome:attendanceOutcome,note:attendanceNote.trim()});
      setMessage(result.message);setAttendanceTarget(null);setAttendanceNote('');await load();
    }catch(e){setError(e instanceof Error?e.message:'Không ghi nhận được tình trạng khách. Vui lòng kiểm tra lại.');}
    finally{setAttendanceBusy(false);}
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
    <div className="panel table-panel"><div className="table-title"><h3>Danh sách đơn</h3><span>{rows.length} kết quả</span></div><div className="table-scroll"><table><thead><tr><th>Mã đặt</th><th>Khách hàng</th><th>Lịch chụp</th><th>Phòng / Gói</th><th>Thanh toán</th><th>Trạng thái</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.booking_code}</strong><small>{money(row.amount_vnd)}</small></td><td>{row.customer_name}<small>{row.customer_phone}</small></td><td>{new Date(`${row.booking_date}T00:00:00`).toLocaleDateString('vi-VN')}<small>{row.time_slot}</small></td><td>{row.room_name}<small>{row.package_name}</small></td><td>{row.payment_status}</td><td><span className={`status status-${row.status.toLowerCase()}`}>{statusName[row.status]||row.status}</span></td><td><div className="table-actions">{row.status==='CONFIRMED'&&row.payment_status==='PAID'&&<button className="button tiny primary" onClick={()=>doCheckin(row)}>Check-in</button>}{row.status==='PENDING_PAYMENT'&&<button className="button tiny light" onClick={()=>cancel(row)}>Hủy</button>}{row.attendance_eligible&&<><button type="button" className="button tiny light" onClick={()=>openAttendance(row,'LATE_ARRIVAL')}>Đến trễ</button><button type="button" className="button tiny light" onClick={()=>openAttendance(row,'NO_SHOW')}>Không đến</button></>}{row.attendance_kind&&<span className="attendance-note" title={row.attendance_note||''}>{row.attendance_kind==='NO_SHOW'?'Đã ghi nhận vắng':'Đã ghi nhận trễ'}</span>}{row.payment_status==='PAID'&&<button className="button tiny light" onClick={()=>{setRefundTarget(row);setRefundAmount(String(row.amount_vnd));}}>Hoàn tiền</button>}</div></td></tr>)}{rows.length===0&&<tr><td colSpan={7} className="empty-cell">Chưa có đơn phù hợp. Hãy tạo đơn từ khu vực khách hàng để thử.</td></tr>}</tbody></table></div></div>
    {attendanceTarget&&<div className="modal-backdrop" role="presentation"><form className="modal panel" onSubmit={submitAttendance} aria-label="Ghi nhận tình trạng khách">
      <button type="button" className="modal-close" onClick={()=>{if(!attendanceBusy)setAttendanceTarget(null)}} aria-label="Đóng">×</button>
      <span className="eyebrow">TÌNH TRẠNG KHÁCH HÀNG</span>
      <h2>{attendanceOutcome==='NO_SHOW'?'Xác nhận khách không đến':'Ghi nhận khách đến trễ'}</h2>
      <p>Đơn {attendanceTarget.booking_code} · {attendanceTarget.customer_name} · {attendanceTarget.time_slot}</p>
      <div className="notice notice-info">{attendanceOutcome==='NO_SHOW'?'Suất đặt được giải phóng sau khi xác nhận. Thanh toán vẫn được giữ nguyên; hoàn tiền phải qua quy trình riêng.':'Chỉ ghi nhận khách đến trễ, chưa check-in hoặc thay đổi lịch.'}</div>
      <label>Ghi chú nhân viên<textarea value={attendanceNote} onChange={e=>setAttendanceNote(e.target.value)} minLength={5} maxLength={500} required placeholder="Mô tả tình huống thực tế (5–500 ký tự)"/></label>
      <button className="button primary full" type="submit" disabled={attendanceBusy||attendanceNote.trim().length<5||attendanceNote.trim().length>500}>{attendanceBusy?'Đang ghi nhận...':'Xác nhận ghi nhận'}</button>
    </form></div>}
    {refundTarget&&<div className="modal-backdrop"><form className="modal panel" onSubmit={submitRefund}><button type="button" className="modal-close" onClick={()=>setRefundTarget(null)}>×</button><span className="eyebrow">REFUND REQUEST</span><h2>Tạo yêu cầu hoàn tiền</h2><p>Đơn {refundTarget.booking_code} · {refundTarget.customer_name}</p><label>Lý do hoàn tiền<textarea value={refundReason} onChange={e=>setRefundReason(e.target.value)} required maxLength={500}/></label><label>Số tiền đề nghị hoàn<input type="number" min="1" max={refundTarget.amount_vnd} value={refundAmount} onChange={e=>setRefundAmount(e.target.value)} required/></label><div className="notice notice-info">Yêu cầu sẽ chuyển đến chủ quán phê duyệt. Chưa có tiền được hoàn tự động.</div><button className="button primary full">Gửi yêu cầu</button></form></div>}
  </>;
}

function normalizeQr(value:string) {
  const trimmed=value.trim().toUpperCase();
  return trimmed.startsWith('HIBI|') ? trimmed.slice(5) : trimmed;
}

type CheckinPreview = {
  bookingCode:string; customerName:string; bookingDate:string; timeSlot:string;
  roomName:string; packageName:string; allowed:boolean; reason:string; message:string;
};

export function StaffCheckinPage() {
  const [cameraOpen,setCameraOpen]=useState(false);
  const [code,setCode]=useState('');
  const [preview,setPreview]=useState<CheckinPreview|null>(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const scanBusyRef=useRef(false);
  const requestIdRef=useRef(0);

  function changeCode(value:string) {
    requestIdRef.current += 1; // Invalidate earlier preview requests after editing the code.
    setCode(value);setPreview(null);setMessage('');setError('');setBusy(false);
  }

  async function previewCode(value:string) {
    const normalized=normalizeQr(value);
    const requestId=++requestIdRef.current;
    setCode(normalized);setPreview(null);setError('');setMessage('');setBusy(true);
    try {
      const result=await api<CheckinPreview>(`/staff/check-in/preview/${encodeURIComponent(normalized)}`);
      if (requestId===requestIdRef.current) setPreview(result);
    } catch(e) {
      if (requestId===requestIdRef.current) setError(e instanceof Error?e.message:'Không kiểm tra được mã đặt phòng.');
    } finally {
      if (requestId===requestIdRef.current) setBusy(false);
    }
  }

  useEffect(()=>{
    if(!cameraOpen) return;
    const scanner=new Html5QrcodeScanner('hibi-qr-reader',{fps:8,qrbox:{width:230,height:230},rememberLastUsedCamera:true},false);
    scanner.render((decodedText)=>{
      if (scanBusyRef.current) return;
      scanBusyRef.current=true;
      // A scan must only show a preview. Staff explicitly confirms the actual check-in.
      void previewCode(decodedText).finally(()=>{
        setCameraOpen(false);
        scanBusyRef.current=false;
      });
    },()=>{});
    return ()=>{void scanner.clear().catch(()=>undefined);};
  },[cameraOpen]);

  function showPreview(event:FormEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    void previewCode(code);
  }

  async function confirmCheckin() {
    if (!preview?.allowed || busy) return;
    const target=preview.bookingCode;
    setError('');setMessage('');setBusy(true);
    try {
      const result=await post<{message:string}>(`/staff/check-in/${encodeURIComponent(target)}`);
      setMessage(result.message);
    } catch(e) {
      // A second employee may already have checked this booking in; force a new lookup.
      setError(e instanceof Error?e.message:'Không thể check-in. Vui lòng kiểm tra lại.');
    } finally {
      setPreview(null);setBusy(false);
    }
  }

  return <>
    <div className="content-heading"><div><span className="eyebrow">QR CHECK-IN</span><h1>Đối chiếu trước khi check-in</h1><p>Quét mã QR hoặc nhập mã đặt phòng. Chỉ xác nhận sau khi kiểm tra tên khách, phòng và giờ chụp.</p></div></div>
    <div className="checkin-grid">
      <div className="panel scanner-panel">
        <div className="scanner-title"><ScanLine/><div><h3>Quét QR tại quầy</h3><p>Quét chỉ để tra cứu; không tự check-in.</p></div></div>
        <div id="hibi-qr-reader" className={cameraOpen?'qr-reader':'qr-reader hidden-reader'}></div>
        {!cameraOpen&&<div className="camera-placeholder"><Camera size={34}/><span>Camera đang tắt</span></div>}
        <button type="button" className={`button ${cameraOpen?'light':'primary'} full`} onClick={()=>setCameraOpen(v=>!v)} disabled={busy}>{cameraOpen?'Đóng camera':'Bật camera quét QR'}</button>
        <p className="tiny-note">Camera chỉ khả dụng trên localhost hoặc HTTPS. Có thể nhập mã thủ công.</p>
      </div>
      <div className="panel">
        <span className="eyebrow">MANUAL CHECK-IN</span><h3>Kiểm tra mã đặt phòng</h3>
        <form onSubmit={showPreview}><label>Mã đặt phòng
          <input value={code} onChange={e=>changeCode(e.target.value)} placeholder="HB-1004112006" required maxLength={100}/>
        </label><button type="submit" className="button light full" disabled={busy||!code.trim()}>{busy?'Đang kiểm tra...':'Kiểm tra đơn'}</button></form>
        {error&&<div className="error-box" role="alert">{error}</div>}
        {message&&<div className="notice" role="status">{message}</div>}
        {preview&&<div className="checkin-preview" aria-live="polite">
          <h3>Thông tin đối chiếu</h3>
          <dl>
            <dt>Mã đặt</dt><dd>{preview.bookingCode}</dd>
            <dt>Khách hàng</dt><dd>{preview.customerName}</dd>
            <dt>Phòng</dt><dd>{preview.roomName}</dd>
            <dt>Gói chụp</dt><dd>{preview.packageName}</dd>
            <dt>Ngày / giờ</dt><dd>{new Date(`${preview.bookingDate}T00:00:00`).toLocaleDateString('vi-VN')} · {preview.timeSlot}</dd>
          </dl>
          <p className={preview.allowed?'checkin-eligible':'checkin-ineligible'}>{preview.message}</p>
          {preview.allowed&&<button type="button" className="button primary full" disabled={busy} onClick={()=>void confirmCheckin()}>{busy?'Đang xác nhận...':'Xác nhận check-in'}</button>}
        </div>}
        <p className="tiny-note">Check-in từ 30 phút trước đến 20 phút sau giờ hẹn. Đơn phải được xác nhận thanh toán. Khi xác nhận, backend kiểm tra trạng thái lần nữa.</p>
      </div>
    </div>
  </>;
}

export function StaffRefundsPage() {
  const [rows,setRows]=useState<Refund[]>([]);const [error,setError]=useState('');const [message,setMessage]=useState('');
  async function load(){try{setRows(await api<Refund[]>('/staff/refunds'));}catch(e){setError(e instanceof Error?e.message:'Không tải được yêu cầu hoàn tiền.');}}
  useEffect(()=>{void load();},[]);
  return <><div className="content-heading"><div><span className="eyebrow">REFUND TRACKING</span><h1>Yêu cầu hoàn tiền</h1><p>Theo dõi yêu cầu hoàn tiền; chỉ chủ quán có quyền phê duyệt hoặc từ chối.</p></div></div>{error&&<div className="error-box">{error}</div>}{message&&<div className="notice">{message}</div>}<div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Mã đặt phòng</th><th>Khách hàng</th><th>Lý do</th><th>Số tiền</th><th>Người gửi</th><th>Trạng thái</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.booking_code}</strong></td><td>{row.customer_name}</td><td>{row.reason}</td><td>{money(row.amount_vnd)}</td><td>{row.requested_by_name}</td><td><span className={`status status-${row.status.toLowerCase()}`}>{row.status}</span></td></tr>)}{!rows.length&&<tr><td colSpan={6} className="empty-cell">Chưa có yêu cầu hoàn tiền.</td></tr>}</tbody></table></div></div><div className="notice notice-info">Nhân viên chỉ gửi và theo dõi yêu cầu. Chủ quán phê duyệt; tiền chưa được hoàn cho đến khi hệ thống tích hợp thêm payout hoặc xác minh thủ công ngoài demo.</div></>;
}
