import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, CalendarDays, CalendarPlus, Camera, CheckCircle2, Clock3, MapPin, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, post } from '../lib/api';
import { googleCalendarLink } from '../lib/calendar';

type Room = { id: number; code: string; name: string; description: string };
type Package = { id: number; code: string; name: string; description: string; price_vnd: number };
type Catalog = { rooms: Room[]; packages: Package[]; timeSlots: string[] };
type BookingResult = {
  id: number; booking_code: string; amount_vnd: number; status: string; payment_status: string;
  hold_expires_at: string; note?: string; message?: string;
};
type LookupBooking = {
  booking_code: string; customer_name: string; customer_phone: string; booking_date: string;
  time_slot: string; amount_vnd: number; status: string; payment_status: string;
  room_name: string; package_name: string; qr_content: string | null;
};
type RescheduleRequest = { id:number; status:string; old_booking_date:string; old_time_slot:string; new_booking_date:string; new_time_slot:string; reason:string; decision_reason:string|null; created_at:string; reviewed_at:string|null };
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
    <section className="section-block packages-section"><div className="section-heading"><div><span className="eyebrow">CHỌN GÓI CHỤP</span><h2>Những gói nhỏ xinh.</h2></div><p>Giá và gói chụp bên dưới là dữ liệu demo, chủ quán có thể thay đổi trong dữ liệu hệ thống.</p></div><PackageCards/></section>
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
  const [qrLoading, setQrLoading] = useState(false);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // One source of truth for QR loading, including retries and returning to a pending booking.
  // Never mark a booking paid without a verified response from the backend.
  async function loadPaymentDetails(code: string) {
    setQrLoading(true);
    setPaymentMessage('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    try {
      const data = await api<PaymentInfo & { amountVnd: number; bookingCode: string }>(
        `/payments/bookings/${code}`, { signal: controller.signal },
      );
      setPaymentInfo(data);
      setBooking(current => current || {
        id: 0, booking_code: data.bookingCode, amount_vnd: data.amountVnd,
        status: data.status, payment_status: data.paymentStatus,
        hold_expires_at: data.holdExpiresAt,
      });
      if (data.mode === 'PAYOS' && data.status === 'PENDING_PAYMENT'
          && !data.qrContent && !data.checkoutUrl) {
        const qr = await api<{ qrContent: string; checkoutUrl: string }>(
          `/payments/bookings/${code}/create`,
          { method: 'POST', signal: controller.signal },
        );
        if (!qr.qrContent && !qr.checkoutUrl) {
          throw new Error('payOS chưa trả về mã QR. Vui lòng thử lại hoặc liên hệ quán.');
        }
        setPaymentInfo({ ...data, ...qr });
      }
    } catch (e) {
      setPaymentMessage(controller.signal.aborted
        ? 'Quá thời gian tải QR. Vui lòng thử lại. Không chuyển tiền khi QR chưa xuất hiện.'
        : e instanceof Error ? e.message : 'Không tải được QR thanh toán.');
    } finally {
      window.clearTimeout(timeout);
      setQrLoading(false);
    }
  }

  useEffect(() => {
    const savedCode = sessionStorage.getItem('hibi_active_booking');
    if (savedCode) void loadPaymentDetails(savedCode);
  }, []);

  useEffect(() => { api<Catalog>('/catalog').then((data) => { setCatalog(data); /* Khách phải chủ động chọn phòng và gói chụp. */ }).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!roomId || !date) {setUnavailable([]);return;}
    let alive=true;
    setUnavailable([]);
    api<{unavailable:string[]}>(`/availability?date=${date}&roomId=${roomId}`)
      .then(data=>{if(alive)setUnavailable(data.unavailable);})
      .catch(e=>{if(alive)setError(e instanceof Error?e.message:'Không lấy được giờ trống.');});
    return ()=>{alive=false;};
  }, [roomId,date]);
  const selectedPackage = catalog?.packages.find((p) => String(p.id) === packageId);
  const availableSlots = useMemo(() => (catalog?.timeSlots || []).filter((slot) => !unavailable.includes(slot)), [catalog, unavailable]);

  useEffect(() => {
    if (!booking || booking.payment_status==='PAID') return;
    const timer=window.setInterval(async () => {
      try {
        // Backend checks the payment with payOS, even when the webhook cannot reach localhost.
        if(paymentInfo?.mode==='PAYOS') {
          try { await post(`/payments/bookings/${booking.booking_code}/reconcile`); } catch { /* do not mark as paid without server confirmation */ }
        }
        const data = await api<PaymentInfo>(`/payments/bookings/${booking.booking_code}`);
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
    if (unavailable.includes(timeSlot)) {setError('Khung giờ không còn trống. Vui lòng chọn khung giờ khác.');return;}
    setLoading(true);
    try {
      const result = await post<BookingResult>('/bookings', { customerName:name, customerPhone:normalizedPhone, customerEmail:email.trim().toLowerCase(), roomId:Number(roomId), packageId:Number(packageId), date, timeSlot });
      sessionStorage.setItem('hibi_active_booking', result.booking_code);
      setBooking(result); setUnavailable((current) => [...current, timeSlot]);
      await loadPaymentDetails(result.booking_code);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể tạo đơn.'); }
    finally { setLoading(false); }
  }

  async function confirmDemoPayment() {
    if (!booking) return;
    setLoading(true); setPaymentMessage('');
    try { await post(`/demo/bookings/${booking.booking_code}/pay`); setBooking({ ...booking, status:'CONFIRMED', payment_status:'PAID' }); }
    catch (e) { setPaymentMessage(e instanceof Error ? e.message : 'Thanh toán demo thất bại.'); }
    finally { setLoading(false); }
  }

  const calendarUrl = paymentInfo?.bookingDate && paymentInfo.timeSlot
    ? googleCalendarLink({date:paymentInfo.bookingDate,timeSlot:paymentInfo.timeSlot,
        bookingCode:booking?.booking_code || '',roomName:paymentInfo.roomName}) : '';

  if (booking) return <section className="narrow-page">
    <div className="page-intro"><span className="eyebrow">HIBI BOOTH · THANH TOÁN</span>
      <h1>{booking.payment_status==='PAID'?'Đặt phòng thành công!':booking.status==='EXPIRED'?'Đã hết thời gian giữ chỗ':'Hoàn tất thanh toán để đặt phòng.'}</h1>
      {booking.payment_status==='PAID' && <p>Xuất trình mã đặt phòng hoặc QR check-in khi đến quán.</p>}
    </div>
    <div className="panel confirmation-panel">
      {booking.payment_status==='PAID' && ['CONFIRMED','CHECKED_IN'].includes(booking.status) ? <><div className="payment-success-mark"><CheckCircle2 size={68} strokeWidth={1.7}/><strong>Thanh toán thành công!</strong><span>Đặt phòng thành công!</span></div><div className="qr-wrap"><QRCodeSVG value={`HIBI|${booking.booking_code}`} size={190} includeMargin/><span>QR CHECK-IN · KHÔNG PHẢI QR THANH TOÁN</span></div>
        {calendarUrl && <a className="button calendar-button full" href={calendarUrl} target="_blank" rel="noopener noreferrer"><CalendarPlus size={18}/> Thêm vào Google Calendar</a>}
        </>:
        booking.status==='PENDING_PAYMENT' ? <>
        {paymentInfo?.mode === 'PAYOS' ? (
          paymentInfo.qrContent ? <div className="qr-wrap">
            <QRCodeSVG value={paymentInfo.qrContent} size={190} includeMargin/>
            <span>QR THANH TOÁN PAYOS</span>
          </div> : qrLoading ? <div className="qr-loading" role="status">Đang lấy mã QR...</div>
          : <div className="qr-unavailable">Chưa có mã QR thanh toán.</div>
        ) : paymentInfo?.mode === 'DEMO_ONLY' ? (
          <div className="qr-unavailable">Chế độ mô phỏng · Không chuyển tiền thật</div>
        ) : qrLoading ? <div className="qr-loading" role="status">Đang kiểm tra thanh toán...</div>
        : <div className="qr-unavailable">Chưa tải được thông tin thanh toán.</div>}
        {paymentInfo?.mode==='PAYOS' && paymentInfo.checkoutUrl && <a className="button primary full" href={paymentInfo.checkoutUrl} target="_blank" rel="noopener noreferrer">Mở trang thanh toán payOS</a>}
        {paymentInfo?.mode==='PAYOS' && !paymentInfo.qrContent && !qrLoading && <button type="button" className="button light full" onClick={()=>void loadPaymentDetails(booking.booking_code)}>Thử tải lại mã QR</button>}
        {!paymentInfo && !qrLoading && <button type="button" className="button light full" onClick={()=>void loadPaymentDetails(booking.booking_code)}>Tải lại thông tin thanh toán</button>}

        <p>Giữ chỗ còn: <strong>{Math.floor(secondsLeft/60)} phút {String(secondsLeft%60).padStart(2,'0')} giây</strong></p>
        {paymentInfo?.mode==='DEMO_ONLY' && <button className="button primary full" onClick={confirmDemoPayment} disabled={loading || secondsLeft===0}>{loading?'Đang xác nhận...':'Mô phỏng thanh toán thành công'}</button>}</>:
        <div className="error-box">Đơn đã hết hạn hoặc không còn hợp lệ. Vui lòng tạo đơn mới.</div>
      }
      <div className="booking-code">{booking.booking_code}</div>
      <div className="info-grid"><div><small>Đơn đặt phòng</small><strong>{statusLabel[booking.status] || booking.status}</strong></div>
        <div><small>Thanh toán</small><strong>{booking.payment_status==='PAID'?paymentInfo?.mode==='PAYOS'?'Đã thanh toán':'Đã thanh toán (demo)':'Chưa thanh toán'}</strong></div>
        <div><small>Số tiền</small><strong>{money(booking.amount_vnd)}</strong></div>
        <div><small>Mã đối chiếu</small><strong>{booking.booking_code}</strong></div></div>
      {paymentMessage && <div className="error-box" role="alert">{paymentMessage}</div>}
      <Link to="/tra-cuu" className="button light full">Tra cứu đơn đặt phòng</Link>
      <button type="button" className="button light full" onClick={()=>{sessionStorage.removeItem("hibi_active_booking");setBooking(null);setPaymentInfo(null);setPaymentMessage("");setQrLoading(false);setTimeSlot("");}}>Đặt thêm lịch khác</button>
    </div>
  </section>;

  return <section className="page-wrap"><div className="page-intro"><span className="eyebrow">ĐẶT CHỖ TRỰC TUYẾN</span><h1>Chọn buổi chụp của bạn.</h1><p>HIBI mở cửa 09:00–23:00 hằng ngày · Mỗi lượt 60 phút · Đặt trước ít nhất 30 phút.</p></div><div className="booking-grid"><form className="panel form-panel" onSubmit={submit} noValidate><div className="form-attention">Vui lòng chọn đầy đủ ngày, phòng, khung giờ, gói chụp và nhập thông tin liên hệ trước khi tiếp tục.</div>{error && <div className="error-box" role="alert">{error}</div>}
    <div className="form-section"><h3><span className="step-number">1</span> Ngày và khung giờ</h3><div className="booking-date-field"><label>Ngày chụp<input type="date" min={today()} value={date} onChange={(e)=>{setDate(e.target.value);setTimeSlot('');}} required/></label></div><div className="room-picker"><div className="room-picker-heading"><strong>Chọn phòng và màu phông nền</strong><span className="field-hint">Bấm vào mẫu màu bạn thích để chọn phòng.</span></div><div className="room-options" role="group" aria-label="Chọn màu phông phòng chụp">{catalog?.rooms.map((room) => { const tone=roomTone(room.code); const selected=roomId===String(room.id); return <button type="button" key={room.id} className={`room-option ${selected?'selected':''}`} aria-pressed={selected} onClick={()=>{setRoomId(String(room.id));setTimeSlot('');setUnavailable([]);}}><span className={`room-preview ${tone.preview}`} aria-hidden="true"><span className="room-preview-photo"><span className="room-preview-person"/></span></span><span className="room-option-details"><strong>{tone.label}</strong><small>{tone.mood}</small><span className="room-option-name">{room.name}</span></span>{selected && <CheckCircle2 className="room-option-check" size={21} aria-hidden="true"/>}</button>; })}</div><small className="field-hint room-picker-note">Mẫu màu để hình dung phông nền; màu trong ảnh thực tế có thể thay đổi theo ánh sáng.</small>{roomId && <p className="room-description">{catalog?.rooms.find(r=>String(r.id)===roomId)?.description}</p>}</div><div className="form-field"><strong>Chọn khung giờ</strong><div className="time-slot-grid" role="group" aria-label="Chọn khung giờ">{catalog?.timeSlots.map(slot => <button type="button" key={slot} className={`time-slot ${timeSlot===slot?'selected':''}`} aria-pressed={timeSlot===slot} onClick={()=>setTimeSlot(slot)} disabled={unavailable.includes(slot) || !roomId || !date} title={unavailable.includes(slot)?"Khung giờ không còn khả dụng":""}>{slot}{unavailable.includes(slot)?" · Kín":""}</button>)}</div><small className="field-hint">Giờ mở cửa 09:00–23:00, mỗi lượt 60 phút. Giờ bắt đầu cuối 22:00.</small></div>{catalog && roomId && date && availableSlots.length===0 && <div className="notice">Ngày này đã kín lịch ở phòng đang chọn. Hãy thử ngày hoặc phòng khác.</div>}</div>
    <div className="form-section"><h3><span className="step-number">2</span> Chọn gói chụp</h3><p className="field-hint">Vui lòng chọn một gói chụp bên dưới.</p><div className="select-cards">{catalog?.packages.map((item)=><button type="button" key={item.id} className={`select-card ${packageId===String(item.id)?'selected':''}`} onClick={()=>setPackageId(String(item.id))}><strong>{item.name}</strong><span>{money(item.price_vnd)}</span><small>{item.description}</small></button>)}</div></div>
    <div className="form-section"><h3><span className="step-number">3</span> Thông tin liên hệ</h3><div className="form-row"><label>Họ và tên<input value={name} onChange={(e)=>setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Nguyễn Văn A" required/></label><label>Số điện thoại<input value={phone} onChange={(e)=>setPhone(e.target.value)} maxLength={30} autoComplete="tel" type="tel" placeholder="09xx xxx xxx" required/></label></div><label>Email nhận xác nhận và nhắc lịch<input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} maxLength={254} autoComplete="email" placeholder="ban@example.com" required/></label><small className="field-hint">Số điện thoại dùng để tra cứu và đối chiếu đơn. Email dùng để gửi xác nhận và nhắc lịch khi quán kích hoạt dịch vụ gửi email.</small></div>
    {error && <div className="error-box" role="alert">{error}</div>}<button className="button primary full" type="submit" disabled={loading || !catalog}>{loading?'Đang tạo đơn...':'Kiểm tra và giữ chỗ'}</button><p className="tiny-note">Đặt lịch trước ít nhất 30 phút · Giữ chỗ tối đa 20 phút · Check-in trễ tối đa 20 phút. Hệ thống lên lịch nhắc qua email trước giờ chụp 60 phút (hoặc sau xác nhận nếu đặt sát giờ); việc gửi thực tế cần kích hoạt nhà cung cấp email.</p>
  </form><aside className="panel booking-summary"><span className="eyebrow">TÓM TẮT</span><h3>Buổi chụp của bạn</h3><div className="summary-line"><CalendarDays size={17}/><span>{date || 'Chưa chọn ngày'}</span></div><div className="summary-line"><Clock3 size={17}/><span>{timeSlot || 'Chưa chọn khung giờ'}</span></div><div className="summary-line"><MapPin size={17}/><span>{catalog?.rooms.find((r)=>String(r.id)===roomId)?.name || 'Chưa chọn phòng'}</span></div><hr/><div className="summary-line"><span>{selectedPackage?.name || 'Chưa chọn gói'}</span><strong>{selectedPackage ? money(selectedPackage.price_vnd) : '—'}</strong></div><p className="tiny-note">Giá hiển thị là giá mẫu trong cơ sở dữ liệu. Chủ quán có thể cập nhật danh mục gói chụp.</p></aside></div></section>;
}

export function LookupPage() {
  const [code, setCode] = useState('');
  const [lookupPhone, setLookupPhone] = useState('');
  const [booking, setBooking] = useState<LookupBooking | null>(null);
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [cancellations,setCancellations]=useState<{id:number;status:string;reason:string;decision_reason:string|null}[]>([]);
  const [cancelReason,setCancelReason]=useState('');
  const [catalog, setCatalog] = useState<Catalog|null>(null);
  const [newDate, setNewDate] = useState('');
  const [newTimeSlot, setNewTimeSlot] = useState('');
  const [rescheduleAvailability, setRescheduleAvailability] = useState<{timeSlots:string[];unavailable:string[]}|null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const phone = lookupPhone.replace(/[\s.-]/g,'');
  const bookingCode = code.trim().toUpperCase();
  async function reloadCancellation() {
    const data=await api<{requests:{id:number;status:string;reason:string;decision_reason:string|null}[]}>(`/bookings/${encodeURIComponent(bookingCode)}/cancellation-requests?phone=${encodeURIComponent(phone)}`);
    setCancellations(data.requests);
  }
  async function sendCancellation(event:FormEvent) {
    event.preventDefault();
    if (loading || cancelReason.trim().length < 5 || cancelReason.trim().length > 500) return;
    const label=booking?.payment_status==='PAID'
      ? 'Gửi yêu cầu hủy để nhân viên/chủ quán xét duyệt? Chưa thực hiện hoàn tiền.'
      : 'Hủy ngay chỗ giữ chưa thanh toán? Thao tác này không thể khôi phục.';
    if (!window.confirm(label)) return;
    setError('');setMessage('');setLoading(true);
    try {
      const result=await post<{message:string;status:string}>(`/bookings/${encodeURIComponent(bookingCode)}/cancellation`,
        {customerPhone:phone,reason:cancelReason.trim()});
      // API has accepted the request; a subsequent lookup failure must not suggest resubmitting it.
      setMessage(result.message);setCancelReason('');
      try {
        await reloadCancellation();
        const current=await api<LookupBooking>(`/bookings/lookup/${encodeURIComponent(bookingCode)}?phone=${encodeURIComponent(phone)}`);
        setBooking(current);
      } catch {
        setError('Yêu cầu đã được ghi nhận nhưng chưa tải lại được trạng thái. Vui lòng tra cứu lại, KHÔNG gửi yêu cầu lần nữa.');
      }
    }catch(e){setError(e instanceof Error?e.message:'Không gửi được yêu cầu hủy.');}
    finally{setLoading(false);}
  }
  async function reloadRequests() {
    const data = await api<{requests:RescheduleRequest[]}>(`/bookings/${encodeURIComponent(bookingCode)}/reschedule-requests?phone=${encodeURIComponent(phone)}`);
    setRequests(data.requests);
  }
  async function lookup(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setBooking(null); setRequests([]);setCancellations([]); setLoading(true);
    try {
      const current = await api<LookupBooking>(`/bookings/lookup/${encodeURIComponent(bookingCode)}?phone=${encodeURIComponent(phone)}`);
      setBooking(current);
      await Promise.all([reloadRequests(),reloadCancellation()]);
      const data = await api<Catalog>('/catalog'); setCatalog(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tra cứu được đơn.'); }
    finally { setLoading(false); }
  }
  async function submitReschedule(event:FormEvent) {
    event.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try {
      const result=await post<{message:string}>(`/bookings/${encodeURIComponent(bookingCode)}/reschedule-requests`,
        { customerPhone:phone, newDate, newTimeSlot, reason:reason.trim() });
      setMessage(result.message); setNewDate('');setNewTimeSlot('');setReason(''); await reloadRequests();
    } catch(e) { setError(e instanceof Error?e.message:'Không gửi được yêu cầu đổi lịch.'); }
    finally { setLoading(false); }
  }
  const canReschedule = booking?.status==='CONFIRMED' && booking.payment_status==='PAID';
  const pending = requests.some(r=>r.status==='PENDING');
  const cancelPending=cancellations.some(r=>r.status==='PENDING');
  useEffect(() => {
    setRescheduleAvailability(null);
    setAvailabilityError('');
    if (!canReschedule || !newDate || !booking || pending || cancelPending) {
      setAvailabilityLoading(false);
      return;
    }
    let active = true;
    setAvailabilityLoading(true);
    void api<{timeSlots:string[];unavailable:string[]}>(
      `/bookings/${encodeURIComponent(booking.booking_code)}/reschedule-availability?phone=${encodeURIComponent(phone)}&date=${encodeURIComponent(newDate)}`)
      .then(data => { if (active) setRescheduleAvailability(data); })
      .catch(e => { if (active) setAvailabilityError(e instanceof Error ? e.message : 'Không kiểm tra được lịch trống.'); })
      .finally(() => { if (active) setAvailabilityLoading(false); });
    return () => { active = false; };
  }, [booking, newDate, canReschedule, pending, cancelPending, phone]);
  const requestLabels:Record<string,string> = {PENDING:'Đang chờ duyệt',APPROVED:'Đã chấp thuận',REJECTED:'Đã từ chối',CANCELLED:'Đã hủy'};
  return <section className="narrow-page"><div className="page-intro"><span className="eyebrow">TRA CỨU ĐẶT PHÒNG</span><h1>Đơn đặt phòng của bạn.</h1><p>Nhập mã đặt phòng và số điện thoại đã đăng ký để bảo vệ thông tin cá nhân. Khách hàng không cần tạo tài khoản.</p></div>
    <div className="panel"><form onSubmit={lookup}><label>Mã đặt phòng<input className="code-input" value={code} onChange={e=>setCode(e.target.value)} placeholder="HB-1004112006" required/></label>
      <label>Số điện thoại đã đặt<input type="tel" value={lookupPhone} onChange={e=>setLookupPhone(e.target.value)} placeholder="09xxxxxxxx" required/></label>
      <button className="button primary full" disabled={loading}><Search size={17}/>{loading?'Đang xử lý...':'Tra cứu đơn'}</button></form>
      {error&&<div className="error-box" role="alert">{error}</div>}{message&&<div className="notice" role="status">{message}</div>}
      {booking&&<div className="lookup-result"><div className="lookup-heading"><div><span className="eyebrow">{booking.booking_code}</span><h3>{booking.customer_name}</h3></div><span className={`status status-${booking.status.toLowerCase()}`}>{statusLabel[booking.status]||booking.status}</span></div>
        <div className="info-grid"><div><small>Ngày chụp</small><strong>{new Date(`${booking.booking_date}T00:00:00`).toLocaleDateString('vi-VN')}</strong></div><div><small>Khung giờ</small><strong>{booking.time_slot}</strong></div><div><small>Phòng</small><strong>{booking.room_name}</strong></div><div><small>Gói chụp</small><strong>{booking.package_name}</strong></div><div><small>Số điện thoại</small><strong>{booking.customer_phone}</strong></div><div><small>Thanh toán</small><strong>{booking.payment_status}</strong></div></div>
        {booking.qr_content && booking.payment_status==='PAID' && ['CONFIRMED','CHECKED_IN'].includes(booking.status) ? <><div className="lookup-qr"><QRCodeSVG value={booking.qr_content} size={160}/><span>Xuất trình mã QR này khi đến quán.</span></div><a className="button calendar-button full" target="_blank" rel="noopener noreferrer" href={googleCalendarLink({date:booking.booking_date,timeSlot:booking.time_slot,bookingCode:booking.booking_code,roomName:booking.room_name})}><CalendarPlus size={18}/> Thêm vào Google Calendar</a></> : <div className="notice notice-info">{booking.status==='EXPIRED'?'Đơn đã hết hạn giữ chỗ, không thể cấp mã check-in.':'Mã QR check-in chỉ hiển thị sau khi thanh toán được xác nhận và đơn còn hiệu lực.'}</div>}
        <hr/><h3>Lịch sử yêu cầu đổi lịch</h3><button type="button" className="button light" onClick={()=>void reloadRequests().catch(e=>setError(e.message))}>Cập nhật trạng thái xét duyệt</button>
        {requests.map(r=><div className="notice notice-info" key={r.id}><strong>{requestLabels[r.status]||r.status}</strong> · {r.new_booking_date.slice(0,10)} lúc {r.new_time_slot}<div>Lý do đề nghị: {r.reason}</div>{r.decision_reason&&<div>Lý do xét duyệt: {r.decision_reason}</div>}</div>)}
        {!requests.length&&<p>Chưa có yêu cầu đổi lịch.</p>}
        {canReschedule && !pending && !cancelPending && <form onSubmit={submitReschedule} className="reschedule-form"><h3>Gửi đề nghị đổi lịch</h3><p>Lịch cũ chỉ thay đổi sau khi nhân viên hoặc chủ quán duyệt.</p>
          <label>Ngày đề xuất<input type="date" min={today()} value={newDate} onChange={e=>{setNewDate(e.target.value);setNewTimeSlot('');}} required/></label>
          <div className="reschedule-time-picker"><strong>Chọn giờ đề xuất còn trống</strong>
            {!newDate && <p className="field-hint">Chọn ngày để xem những khung giờ có thể đề xuất.</p>}
            {availabilityLoading && <p className="field-hint" role="status">Đang kiểm tra khung giờ...</p>}
            {availabilityError && <div className="error-box" role="alert">{availabilityError} <button className="button light tiny" type="button" onClick={()=>{setNewDate('');setNewTimeSlot('');}}>Chọn lại ngày</button></div>}
            {rescheduleAvailability && <div className="time-slot-grid" role="group" aria-label="Chọn khung giờ đổi lịch">
              {rescheduleAvailability.timeSlots.map(slot => { const unavailable = rescheduleAvailability.unavailable.includes(slot);
                return <button type="button" key={slot} className={`time-slot ${newTimeSlot===slot?'selected':''}`}
                  aria-pressed={newTimeSlot===slot} disabled={unavailable || loading} onClick={()=>setNewTimeSlot(slot)}
                  title={unavailable?'Khung giờ không khả dụng':`Đề xuất ${slot}`}>{slot}{unavailable?' · Kín':''}</button>; })}
            </div>}
            {rescheduleAvailability && rescheduleAvailability.timeSlots.every(slot=>rescheduleAvailability.unavailable.includes(slot)) &&
              <p className="field-hint">Ngày này không còn giờ phù hợp. Vui lòng chọn ngày khác.</p>}
            <p className="field-hint">Giờ trống chỉ mang tính tham khảo; hệ thống kiểm tra lại khi nhân viên/chủ quán phê duyệt.</p>
          </div>
          <label>Lý do đổi lịch<textarea value={reason} onChange={e=>setReason(e.target.value)} minLength={5} maxLength={500} required placeholder="Vui lòng nhập ít nhất 5 ký tự"/></label>
          <button className="button primary full" disabled={loading || availabilityLoading || !rescheduleAvailability || !newTimeSlot || rescheduleAvailability.unavailable.includes(newTimeSlot)}>Gửi yêu cầu đổi lịch</button>
        </form>}
        {pending&&<div className="notice notice-info">Đơn đang có yêu cầu chờ xét duyệt. Không thể tạo yêu cầu khác cho tới khi được xử lý.</div>}
        <hr/><h3>Hủy đặt phòng</h3>
        {cancellations.map(r=><div className="notice notice-info" key={r.id}>
          <strong>{r.status==='PENDING'?'Đang chờ duyệt hủy':r.status==='APPROVED'?'Đã chấp thuận hủy':'Đã từ chối hủy'}</strong>
          <div>Lý do: {r.reason}</div>{r.decision_reason&&<div>Phản hồi: {r.decision_reason}</div>}
        </div>)}
        {cancelPending&&<div className="notice notice-info">Yêu cầu hủy đang chờ xét duyệt. Lịch hiện tại vẫn được giữ cho đến khi có quyết định.</div>}
        {!cancelPending && !pending && ((booking.status==='CONFIRMED'&&booking.payment_status==='PAID') || (booking.status==='PENDING_PAYMENT'&&booking.payment_status==='PENDING')) &&
          <form onSubmit={sendCancellation} className="reschedule-form">
            <p>{booking.payment_status==='PAID'?'Đơn đã thanh toán cần nhân viên/chủ quán duyệt hủy. Hoàn tiền cần chủ quán duyệt riêng; không tự động chuyển tiền.':'Đơn chưa thanh toán sẽ được hủy ngay và giải phóng chỗ giữ tạm.'}</p>
            <label>Lý do hủy<input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} minLength={5} maxLength={500} required placeholder="Vui lòng nhập lý do hủy"/></label>
            <button className="button light full" disabled={loading||cancelReason.trim().length<5||cancelReason.trim().length>500}>{loading?'Đang gửi yêu cầu...':'Gửi yêu cầu hủy đặt phòng'}</button>
          </form>}

      </div>}
    </div></section>;
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

