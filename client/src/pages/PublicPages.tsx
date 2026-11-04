import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, CalendarDays, CalendarPlus, Camera, CheckCircle2, Clock3, Mail, MapPin, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, post } from '../lib/api';
import { googleCalendarLink } from '../lib/calendar';

type Room = { id: number; code: string; name: string; description: string };
type Package = { id: number; code: string; name: string; description: string; price_vnd: number };
type Catalog = { rooms: Room[]; packages: Package[]; timeSlots: string[]; bookingEnabled?: boolean };
type BookingResult = {
  id: number; booking_code: string; amount_vnd: number; status: string; payment_status: string;
  hold_expires_at: string; note?: string; message?: string;
};
type LookupBooking = {
  booking_code: string; customer_name: string; customer_phone: string; booking_date: string;
  time_slot: string; amount_vnd: number; status: string; payment_status: string;
  room_name: string; package_name: string; qr_content: string | null;
};
type PaymentInfo = {mode:string;qrContent:string;note:string;status:string;paymentStatus:string;
  holdExpiresAt:string;checkoutUrl?:string|null;bookingDate?:string;timeSlot?:string;
  roomName?:string;emailNotificationsEnabled?:boolean};
const money = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';
const today = () => { const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value])); return `${parts.year}-${parts.month}-${parts.day}`; }; 
const validCustomerName = (value: string) => { const v=value.trim().replace(/\s+/g,' '); return v.length>=2 && v.length<=120 && [...v].filter(c=>/\p{L}/u.test(c)).length>=2 && /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u.test(v); };
const statusLabel: Record<string,string> = { PENDING_PAYMENT:'Chờ thanh toán', CONFIRMED:'Đã xác nhận', CHECKED_IN:'Đã check-in', CANCELLED:'Đã hủy', EXPIRED:'Hết hạn' };

// Bảng màu phông minh họa. Dùng mã phòng từ API để không phụ thuộc tên hiển thị.
const ROOM_TONES: Record<string, { label: string; mood: string; preview: string }> = {
  GRAY:  { label: 'Phông xám',  mood: 'Thanh lịch · hiện đại', preview: 'room-preview-gray' },
  BLACK: { label: 'Phông đen', mood: 'Cá tính · tương phản', preview: 'room-preview-black' },
  WHITE: { label: 'Phông trắng',mood: 'Tươi sáng · tối giản', preview: 'room-preview-white' },
  RED:   { label: 'Phông đỏ',  mood: 'Nổi bật · ấm áp', preview: 'room-preview-red' },
};
const roomTone = (code: string) => ROOM_TONES[code.toUpperCase()] ?? { label: 'Phông nền', mood: 'Xem mô tả phòng', preview: 'room-preview-default' };


export function HomePage() {
  return <>
    <section className="hero">
      <div className="hero-copy"><span className="eyebrow"><Sparkles size={15}/> HIBI BOOTH · ĐẶT LỊCH TRỰC TUYẾN</span><h1>Một chút vui.<br/>Một cuộn <em>kỷ niệm.</em></h1><p>Chọn không gian, chọn giờ chụp và nhận mã xác nhận. Hibi Booth giúp bạn đặt lịch nhanh gọn để dành thời gian cho những khoảnh khắc đáng nhớ.</p><div className="hero-actions"><Link className="button primary" to="/dat-lich">Đặt lịch ngay <ArrowRight size={17}/></Link><Link className="button light" to="/tra-cuu">Tra cứu đặt phòng</Link></div><div className="hero-notes"><span><CheckCircle2 size={16}/> Kiểm tra lịch trống</span><span><CheckCircle2 size={16}/> QR xác nhận</span><span><CheckCircle2 size={16}/> Có nhân viên hỗ trợ</span></div></div>
      <div className="hero-art"><div className="art-stamp">POSE · PRINT · REPEAT</div><div className="photo-row">
  <div className="photo photo-a">
    <img src="/images/hibi-portrait.jpg" alt="Ảnh photobooth cá nhân" />
  </div>

  <div className="photo photo-b">
    <img src="/images/hibi-friends.png" alt="Ảnh nhóm bạn tại HIBI" />
  </div>


</div><div className="art-caption">keep it a little silly.</div><div className="art-ticket">YOUR MEMORY<br/><strong>STARTS HERE</strong></div></div>
    </section>
    <section className="hibi-slogan"><div className="hibi-slogan-kicker">NẮM GIỮ KHOẢNH KHẮC</div><strong>Book lịch liền tay, <em>tới là chụp ngay.</em></strong></section>
    <section className="section-block"><div className="section-heading"><div><span className="eyebrow">BẮT ĐẦU THẬT DỄ</span><h2>Đặt nhanh. Chụp vui.</h2></div><p>Hệ thống xử lý các bước có quy tắc rõ ràng; nhân viên hỗ trợ khi cần kiểm tra hoặc xử lý ngoại lệ.</p></div><div className="feature-grid"><article className="feature-card"><CalendarDays/><h3>Chọn lịch linh hoạt</h3><p>Kiểm tra ngày, phòng và khung giờ còn trống trước khi gửi yêu cầu.</p></article><article className="feature-card"><ShieldCheck/><h3>Mã đặt phòng riêng</h3><p>Dùng mã đặt phòng để tra cứu lại thông tin và xuất trình khi đến quán.</p></article><article className="feature-card"><Camera/><h3>Check-in bằng QR</h3><p>Nhân viên quét mã QR hoặc nhập mã để đối chiếu đơn đặt phòng.</p></article></div></section>
    <section className="section-block packages-section"><div className="section-heading"><div><span className="eyebrow">CHỌN GÓI CHỤP</span><h2>Những gói nhỏ xinh.</h2></div><p>Giá và gói chụp được cập nhật từ hệ thống HIBI BOOTH.</p></div><PackageCards/></section>
  </>;
}

function PackageCards() {
  const [packages, setPackages] = useState<Package[]>([]);
  useEffect(() => { api<Catalog>('/catalog').then((data) => setPackages(data.packages)).catch(() => setPackages([])); }, []);
  return <div className="package-grid">{packages.map((item, index) => <article className={`package-card ${index===1?'featured':''}`} key={item.id}><span className="package-tag">{item.code}</span><h3>{item.name}</h3><strong>{money(item.price_vnd)}</strong><p>{item.description}</p><Link to="/dat-lich" className="text-link">Chọn gói này <ArrowRight size={15}/></Link></article>)}</div>;
}

export function BookingPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [roomId, setRoomId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [date, setDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('');
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const [tick, setTick] = useState(Date.now());
  const paymentApi = <T,>(path: string, method = 'GET') => api<T>(path,{ method, headers: {'X-Booking-Phone': sessionStorage.getItem('hibi_booking_phone') || ''} });
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const savedCode = sessionStorage.getItem('hibi_active_booking');
    if (!savedCode || !sessionStorage.getItem('hibi_booking_phone')) return;
    paymentApi<PaymentInfo & {amountVnd:number;bookingCode:string}>(`/payments/bookings/${savedCode}`)
      .then(data => {
        setBooking({id:0,booking_code:data.bookingCode,amount_vnd:data.amountVnd,status:data.status,payment_status:data.paymentStatus,hold_expires_at:data.holdExpiresAt});
        setPaymentInfo(data);
        if(data.mode==='PAYOS' && data.status==='PENDING_PAYMENT' && !data.qrContent) {
          paymentApi<{qrContent:string;checkoutUrl:string}>(`/payments/bookings/${savedCode}/create`,'POST')
            .then(qr => setPaymentInfo(current => current ? {...current,...qr} : null))
            .catch(() => setPaymentMessage('Không thể tạo QR payOS. Vui lòng liên hệ quán.'));
        }
      })
      .catch(() => sessionStorage.removeItem('hibi_active_booking'));
  }, []);

  useEffect(() => { api<Catalog>('/catalog').then((data) => { setCatalog(data); /* Khách phải chủ động chọn phòng và gói chụp. */ }).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!roomId || !date) return;
    api<{unavailable:string[]}>(`/availability?date=${date}&roomId=${roomId}`).then((data) => setUnavailable(data.unavailable)).catch((e) => setError(e.message));
  }, [roomId, date]);
  const selectedPackage = catalog?.packages.find((p) => String(p.id) === packageId);
  const availableSlots = useMemo(() => (catalog?.timeSlots || []).filter((slot) => !unavailable.includes(slot)), [catalog, unavailable]);

  useEffect(() => {
    if (!booking || booking.payment_status==='PAID') return;
    const timer=window.setInterval(async () => {
      try {
        // Backend checks the payment with payOS, even when the webhook cannot reach localhost.
        if(paymentInfo?.mode==='PAYOS') {
          try { await paymentApi(`/payments/bookings/${booking.booking_code}/reconcile`,'POST'); } catch { /* do not mark as paid without server confirmation */ }
        }
        const data = await paymentApi<PaymentInfo>(`/payments/bookings/${booking.booking_code}`);
        setPaymentInfo(current => ({...current,...data,qrContent:data.qrContent || current?.qrContent || ''}));
        if (data.paymentStatus==='PAID' || data.status==='EXPIRED') {
          setBooking(current => current ? {...current,status:data.status,payment_status:data.paymentStatus}:current);
        }
      } catch { /* lỗi mạng tạm thời, người dùng có thể tra cứu lại */ }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [booking?.booking_code, booking?.payment_status, paymentInfo?.mode]);
  const secondsLeft = Math.max(0, Math.floor((new Date(paymentInfo?.holdExpiresAt || booking?.hold_expires_at || Date.now()).getTime()-tick)/1000));

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setPaymentMessage('');
    if (catalog?.bookingEnabled===false) { setError('HIBI BOOTH chưa mở nhận đặt lịch trên trang công khai.'); return; }
    const normalizedPhone = phone.replace(/[\s.-]/g, '');

    if (!date) { setError('Vui lòng chọn ngày chụp.'); return; }
    if (!roomId) { setError('Vui lòng chọn phòng chụp.'); return; }
    if (!timeSlot) { setError('Vui lòng chọn khung giờ.'); return; }
    if (!packageId) { setError('Vui lòng chọn gói chụp.'); return; }
    if (!name.trim()) { setError('Vui lòng điền họ và tên.'); return; }
    if (!validCustomerName(name)) { setError('Họ và tên chỉ được chứa chữ cái và dấu cách, không được chứa số hoặc ký tự đặc biệt.'); return; }
    if (!phone.trim()) { setError('Vui lòng điền số điện thoại.'); return; }
    if (!/^(03|05|07|08|09)\d{8}$/.test(normalizedPhone)) {
      setError('Số điện thoại phải có 10 chữ số và bắt đầu bằng 03, 05, 07, 08 hoặc 09.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length>254) {
      setError('Vui lòng nhập email hợp lệ để nhận xác nhận và nhắc lịch.'); return;
    }
    const slotStartMs = Date.parse(`${date}T${timeSlot}:00+07:00`);
    if (!Number.isFinite(slotStartMs) || slotStartMs-Date.now()<30*60_000) {
      setError('Vui lòng chọn khung giờ bắt đầu sau ít nhất 30 phút kể từ hiện tại.');
      return;
    }
    setLoading(true);
    try {
      const result = await post<BookingResult>('/bookings', { customerName:name, customerPhone:normalizedPhone, customerEmail:email.trim().toLowerCase(), roomId:Number(roomId), packageId:Number(packageId), date, timeSlot });
      sessionStorage.setItem('hibi_active_booking', result.booking_code);
      sessionStorage.setItem('hibi_booking_phone',normalizedPhone);
      setBooking(result); setUnavailable((current) => [...current, timeSlot]);
      try { const info=await paymentApi<PaymentInfo>(`/payments/bookings/${result.booking_code}`); if(info.mode==='PAYOS') { const qr=await paymentApi<{qrContent:string;checkoutUrl:string}>(`/payments/bookings/${result.booking_code}/create`,'POST'); setPaymentInfo({...info,...qr}); } else setPaymentInfo(info); } catch { setPaymentMessage('Chưa tải được thông tin thanh toán.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể tạo đơn.'); }
    finally { setLoading(false); }
  }

  async function confirmDemoPayment() {
    if (!booking) return;
    setLoading(true); setPaymentMessage('');
    try { const result = await post<{message:string}>(`/demo/bookings/${booking.booking_code}/pay`); setPaymentMessage(result.message); setBooking({ ...booking, status:'CONFIRMED', payment_status:'PAID' }); }
    catch (e) { setPaymentMessage(e instanceof Error ? e.message : 'Thanh toán demo thất bại.'); }
    finally { setLoading(false); }
  }

  const calendarUrl = paymentInfo?.bookingDate && paymentInfo.timeSlot
    ? googleCalendarLink({date:paymentInfo.bookingDate,timeSlot:paymentInfo.timeSlot,
        bookingCode:booking?.booking_code || '',roomName:paymentInfo.roomName}) : '';

  if (catalog?.bookingEnabled===false && !booking) return <section className="narrow-page"><div className="panel"><h1>HIBI BOOTH đang hoàn thiện</h1><p>Website đang mở để xem trước, chưa nhận đặt phòng và thanh toán trực tuyến. Vui lòng quay lại sau.</p><Link className="button primary" to="/">Về trang chủ</Link></div></section>;

  if (booking) return <section className="narrow-page">
    <div className="page-intro"><span className="eyebrow">HIBI BOOTH · THANH TOÁN</span>
      <h1>{booking.payment_status==='PAID'?'Đặt phòng thành công!':booking.status==='EXPIRED'?'Đã hết thời gian giữ chỗ':'Hoàn tất thanh toán để đặt phòng.'}</h1>
      <p>{booking.payment_status==='PAID'?'Hãy lưu mã đặt phòng và QR check-in để xuất trình khi đến quán.':'Hệ thống giữ phòng trong 20 phút. Quét QR payOS để thanh toán; đơn chỉ được xác nhận khi hệ thống nhận thông báo hợp lệ.'}</p>
    </div>
    <div className="panel confirmation-panel">
      {booking.payment_status==='PAID' && ['CONFIRMED','CHECKED_IN'].includes(booking.status) ? <><div className="payment-success-mark"><CheckCircle2 size={68} strokeWidth={1.7}/><strong>Thanh toán thành công!</strong><span>Đặt phòng thành công!</span></div><div className="qr-wrap"><QRCodeSVG value={`HIBI|${booking.booking_code}`} size={190} includeMargin/><span>QR CHECK-IN · KHÔNG PHẢI QR THANH TOÁN</span></div>
        <div className="notice">{paymentInfo?.mode==='PAYOS'?'payOS đã xác nhận thanh toán thành công.':'Đặt phòng đã được xác nhận bằng giao dịch mô phỏng.'}</div>
        {calendarUrl && <a className="button calendar-button full" href={calendarUrl} target="_blank" rel="noopener noreferrer"><CalendarPlus size={18}/> Thêm vào Google Calendar</a>}
        <div className="email-reminder-notice"><Mail size={19}/><span>{paymentInfo?.emailNotificationsEnabled
          ? 'HIBI sẽ gửi email xác nhận và nhắc lịch trước giờ chụp 60 phút. Nếu đặt sát giờ, email nhắc được gửi sau khi xác nhận.'
          : 'Lịch nhắc email đã được lưu; quán chưa kích hoạt dịch vụ gửi email thực tế.'} Google Calendar chỉ lưu lịch khi bạn bấm Lưu trong Google.</span></div></>:
        booking.status==='PENDING_PAYMENT' ? <><div className="qr-wrap">{paymentInfo?.qrContent ? <QRCodeSVG value={paymentInfo.qrContent} size={190} includeMargin/> : <p>Đang tải QR thanh toán...</p>}<span>{paymentInfo?.mode==='PAYOS'?'QR THANH TOÁN PAYOS':'QR MÔ PHỎNG · KHÔNG THỂ CHUYỂN KHOẢN'}</span></div>
        <div className="notice notice-info">{paymentInfo?.mode==='PAYOS'?'Sau khi thanh toán, hệ thống tự xác minh và xác nhận đơn. Không đóng trang khi đang chuyển khoản.':'Đây là chế độ thanh toán mô phỏng, không chuyển tiền thật.'}</div>
        {paymentInfo?.mode==='PAYOS' && paymentInfo.checkoutUrl && <a className="button primary full" href={paymentInfo.checkoutUrl} target="_blank" rel="noopener noreferrer">Mở trang thanh toán payOS</a>}
        <p>Giữ chỗ còn: <strong>{Math.floor(secondsLeft/60)} phút {String(secondsLeft%60).padStart(2,'0')} giây</strong></p>
        {paymentInfo?.mode!=='PAYOS' && <button className="button primary full" onClick={confirmDemoPayment} disabled={loading || secondsLeft===0}>{loading?'Đang xác nhận...':'Mô phỏng payOS báo thanh toán thành công'}</button>}</>:
        <div className="error-box">Đơn đã hết hạn hoặc không còn hợp lệ. Vui lòng tạo đơn mới.</div>
      }
      <div className="booking-code">{booking.booking_code}</div>
      <div className="info-grid"><div><small>Đơn đặt phòng</small><strong>{statusLabel[booking.status] || booking.status}</strong></div>
        <div><small>Thanh toán</small><strong>{booking.payment_status==='PAID'?paymentInfo?.mode==='PAYOS'?'Đã thanh toán':'Đã thanh toán (demo)':'Chưa thanh toán'}</strong></div>
        <div><small>Số tiền</small><strong>{money(booking.amount_vnd)}</strong></div>
        <div><small>Mã đối chiếu</small><strong>{booking.booking_code}</strong></div></div>
      {paymentMessage && <div className="notice">{paymentMessage}</div>}
      <Link to="/tra-cuu" className="button light full">Tra cứu đơn đặt phòng</Link>
      <button type="button" className="button light full" onClick={()=>{sessionStorage.removeItem("hibi_active_booking");sessionStorage.removeItem("hibi_booking_phone");setBooking(null);setPaymentInfo(null);setTimeSlot("");}}>Đặt thêm lịch khác</button>
    </div>
  </section>;

  return <section className="page-wrap"><div className="page-intro"><span className="eyebrow">ĐẶT CHỖ TRỰC TUYẾN</span><h1>Chọn buổi chụp của bạn.</h1><p>HIBI mở cửa 09:00–23:00 hằng ngày · Mỗi lượt 60 phút · Đặt trước ít nhất 30 phút.</p></div><div className="booking-grid"><form className="panel form-panel" onSubmit={submit} noValidate><div className="form-attention">Vui lòng chọn đầy đủ ngày, phòng, khung giờ, gói chụp và nhập thông tin liên hệ trước khi tiếp tục.</div>{error && <div className="error-box" role="alert">{error}</div>}
    <div className="form-section"><h3><span className="step-number">1</span> Ngày và khung giờ</h3><div className="booking-date-field"><label>Ngày chụp<input type="date" min={today()} value={date} onChange={(e)=>{setDate(e.target.value);setTimeSlot('');}} required/></label></div><div className="room-picker"><div className="room-picker-heading"><strong>Chọn phòng và màu phông nền</strong><span className="field-hint">Bấm vào mẫu màu bạn thích để chọn phòng.</span></div><div className="room-options" role="group" aria-label="Chọn màu phông phòng chụp">{catalog?.rooms.map((room) => { const tone=roomTone(room.code); const selected=roomId===String(room.id); return <button type="button" key={room.id} className={`room-option ${selected?'selected':''}`} aria-pressed={selected} onClick={()=>{setRoomId(String(room.id));setTimeSlot('');setUnavailable([]);}}><span className={`room-preview ${tone.preview}`} aria-hidden="true"><span className="room-preview-photo"><span className="room-preview-person"/></span></span><span className="room-option-details"><strong>{tone.label}</strong><small>{tone.mood}</small><span className="room-option-name">{room.name}</span></span>{selected && <CheckCircle2 className="room-option-check" size={21} aria-hidden="true"/>}</button>; })}</div><small className="field-hint room-picker-note">Mẫu màu để hình dung phông nền; màu trong ảnh thực tế có thể thay đổi theo ánh sáng.</small>{roomId && <p className="room-description">{catalog?.rooms.find(r=>String(r.id)===roomId)?.description}</p>}</div><div className="form-field"><strong>Chọn khung giờ</strong><div className="time-slot-grid" role="group" aria-label="Chọn khung giờ">{catalog?.timeSlots.map(slot => <button type="button" key={slot} className={`time-slot ${timeSlot===slot?'selected':''}`} disabled={unavailable.includes(slot)} aria-pressed={timeSlot===slot} onClick={()=>setTimeSlot(slot)}>{slot}</button>)}</div><small className="field-hint">Giờ mở cửa 09:00–23:00, mỗi lượt 60 phút. Giờ bắt đầu cuối 22:00.</small></div>{catalog && roomId && date && availableSlots.length===0 && <div className="notice">Ngày này đã kín lịch ở phòng đang chọn. Hãy thử ngày hoặc phòng khác.</div>}</div>
    <div className="form-section"><h3><span className="step-number">2</span> Chọn gói chụp</h3><p className="field-hint">Vui lòng chọn một gói chụp bên dưới.</p><div className="select-cards">{catalog?.packages.map((item)=><button type="button" key={item.id} className={`select-card ${packageId===String(item.id)?'selected':''}`} onClick={()=>setPackageId(String(item.id))}><strong>{item.name}</strong><span>{money(item.price_vnd)}</span><small>{item.description}</small></button>)}</div></div>
    <div className="form-section"><h3><span className="step-number">3</span> Thông tin liên hệ</h3><div className="form-row"><label>Họ và tên<input value={name} onChange={(e)=>setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Nguyễn Văn A" required/></label><label>Số điện thoại<input value={phone} onChange={(e)=>setPhone(e.target.value)} maxLength={30} autoComplete="tel" type="tel" placeholder="09xx xxx xxx" required/></label></div><label>Email nhận xác nhận và nhắc lịch<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} maxLength={254} autoComplete="email" placeholder="ban@example.com" required/></label><small className="field-hint">Số điện thoại dùng để tra cứu và đối chiếu đơn. Email dùng để gửi xác nhận và nhắc lịch khi quán kích hoạt dịch vụ gửi email.</small></div>
    {error && <div className="error-box" role="alert">{error}</div>}<button className="button primary full" type="submit" disabled={loading || !catalog}>{loading?'Đang tạo đơn...':'Kiểm tra và giữ chỗ'}</button><p className="tiny-note">Đặt lịch trước ít nhất 30 phút · Giữ chỗ tối đa 20 phút · Check-in trễ tối đa 20 phút. Hệ thống lên lịch nhắc qua email trước giờ chụp 60 phút (hoặc sau xác nhận nếu đặt sát giờ); việc gửi thực tế cần kích hoạt nhà cung cấp email.</p>
  </form><aside className="panel booking-summary"><span className="eyebrow">TÓM TẮT</span><h3>Buổi chụp của bạn</h3><div className="summary-line"><CalendarDays size={17}/><span>{date || 'Chưa chọn ngày'}</span></div><div className="summary-line"><Clock3 size={17}/><span>{timeSlot || 'Chưa chọn khung giờ'}</span></div><div className="summary-line"><MapPin size={17}/><span>{catalog?.rooms.find((r)=>String(r.id)===roomId)?.name || 'Chưa chọn phòng'}</span></div><hr/><div className="summary-line"><span>{selectedPackage?.name || 'Chưa chọn gói'}</span><strong>{selectedPackage ? money(selectedPackage.price_vnd) : '—'}</strong></div><p className="tiny-note">Giá hiển thị là giá mẫu trong cơ sở dữ liệu. Chủ quán có thể cập nhật danh mục gói chụp.</p></aside></div></section>;
}

export function LookupPage() {
  const [code, setCode] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [booking, setBooking] = useState<LookupBooking | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function lookup(event: FormEvent) {
    event.preventDefault(); setError(''); setBooking(null); setLoading(true);
    try { setBooking(await api<LookupBooking>(`/bookings/lookup/${encodeURIComponent(code.trim().toUpperCase())}?phone=${encodeURIComponent(lookupPhone.replace(/[\s.-]/g,''))}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tra cứu được đơn.'); }
    finally { setLoading(false); }
  }
  return <section className="narrow-page"><div className="page-intro"><span className="eyebrow">TRA CỨU ĐẶT PHÒNG</span><h1>Đơn đặt phòng của bạn.</h1><p>Nhập mã đặt phòng và số điện thoại đã đăng ký để bảo vệ thông tin cá nhân. Khách hàng không cần tạo tài khoản.</p></div><div className="panel"><form onSubmit={lookup}><label>Mã đặt phòng<input className="code-input" value={code} onChange={(e)=>setCode(e.target.value)} placeholder="HB-1004112006" required/></label><label>Số điện thoại đã đặt<input type="tel" value={lookupPhone} onChange={(e)=>setLookupPhone(e.target.value)} placeholder="09xxxxxxxx" required/></label><button className="button primary full" disabled={loading}><Search size={17}/>{loading?'Đang tra cứu...':'Tra cứu đơn'}</button></form>{error && <div className="error-box">{error}</div>}{booking && <div className="lookup-result"><div className="lookup-heading"><div><span className="eyebrow">{booking.booking_code}</span><h3>{booking.customer_name}</h3></div><span className={`status status-${booking.status.toLowerCase()}`}>{statusLabel[booking.status] || booking.status}</span></div><div className="info-grid"><div><small>Ngày chụp</small><strong>{new Date(`${booking.booking_date}T00:00:00`).toLocaleDateString('vi-VN')}</strong></div><div><small>Khung giờ</small><strong>{booking.time_slot}</strong></div><div><small>Phòng</small><strong>{booking.room_name}</strong></div><div><small>Gói chụp</small><strong>{booking.package_name}</strong></div><div><small>Số điện thoại</small><strong>{booking.customer_phone}</strong></div><div><small>Thanh toán</small><strong>{booking.payment_status}</strong></div></div>{booking.qr_content && booking.payment_status==='PAID' && ['CONFIRMED','CHECKED_IN'].includes(booking.status) ?
    <><div className="lookup-qr"><QRCodeSVG value={booking.qr_content} size={160}/><span>Xuất trình mã QR này khi đến quán.</span></div><a className="button calendar-button full" target="_blank" rel="noopener noreferrer" href={googleCalendarLink({date:booking.booking_date,timeSlot:booking.time_slot,bookingCode:booking.booking_code,roomName:booking.room_name})}><CalendarPlus size={18}/> Thêm vào Google Calendar</a></> :
    <div className="notice notice-info">{booking.status==='EXPIRED' ? 'Đơn đã hết hạn giữ chỗ, không thể cấp mã check-in.' : 'Mã QR check-in chỉ hiển thị sau khi thanh toán được xác nhận và đơn còn hiệu lực.'}</div>}</div>}</div></section>;
}

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setLoading(true);
    try { const user = await login(email, password); navigate(user.role === 'OWNER' ? '/chu-quan' : '/nhan-vien'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Đăng nhập thất bại.'); }
    finally { setLoading(false); }
  }
  return <section className="narrow-page"><div className="page-intro"><span className="eyebrow">HIBI BOOTH · PRIVATE AREA</span><h1>Đăng nhập quản trị.</h1><p>Khu vực dành cho nhân viên và chủ quán. Khách hàng chỉ cần mã đặt phòng để tra cứu.</p></div><form className="panel" onSubmit={submit}><label>Email<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required/></label><label>Mật khẩu<input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required/></label>{error && <div className="error-box">{error}</div>}<button className="button primary full" disabled={loading}>{loading?'Đang đăng nhập...':'Đăng nhập'}</button></form></section>;
}

