// Transactional booking email queue. The configured provider must acknowledge a message;
// SUBMITTED is not proof of inbox delivery. No email is sent when EMAIL_PROVIDER=disabled.

const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || 'disabled').toLowerCase();
const RESEND_API_KEY = String(process.env.RESEND_API_KEY || '').trim();
const EMAIL_FROM = String(process.env.EMAIL_FROM || '').trim();

export function isValidCustomerEmail(input) {
  if (typeof input !== 'string') return false;
  const value = input.trim();
  return value.length <= 254 && value.length >= 6 &&
    /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(value);
}

export function googleCalendarUrl({ bookingDate, timeSlot, bookingCode, roomName = 'HIBI BOOTH' }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(bookingDate)) || !/^\d{2}:\d{2}$/.test(String(timeSlot))) return '';
  const start = Date.parse(`${bookingDate}T${timeSlot}:00+07:00`);
  if (!Number.isFinite(start)) return '';
  const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: 'Lịch chụp ảnh HIBI BOOTH',
    dates: `${utc(start)}/${utc(start + 60 * 60_000)}`,
    stz: 'Asia/Ho_Chi_Minh',
    etz: 'Asia/Ho_Chi_Minh',
    details: `Mã đặt phòng: ${bookingCode}\nPhòng: ${roomName}\nĐến đúng giờ. Check-in trễ tối đa 20 phút.`,
    location: 'HIBI BOOTH',
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}

export function emailMessage(kind, booking) {
  const { booking_code: code, customer_name: name, booking_date: date, time_slot: timeSlot, room_name: roomName } = booking;
  const [year, month, day] = String(date).split('-');
  const calendarLink = googleCalendarUrl({bookingDate:date, timeSlot, bookingCode:code, roomName});
  const when = `${timeSlot} ngày ${day}/${month}/${year}`;
  return kind === 'CONFIRMATION'
    ? {
        subject: `HIBI BOOTH - Xác nhận đặt phòng ${code}`,
        text: `Xin chào ${name},\n\nHIBI BOOTH xác nhận bạn đã thanh toán và đặt phòng thành công.\nMã đặt phòng: ${code}\nThời gian: ${when} (giờ Việt Nam)\nPhòng: ${roomName}\nThời lượng: 60 phút\n\nThêm lịch vào Google Calendar (bạn cần tự bấm Lưu):\n${calendarLink}\n\nVui lòng đến đúng giờ; check-in trễ tối đa 20 phút. Xuất trình mã đặt phòng hoặc QR check-in trên trang Tra cứu khi đến quán.\n\nHIBI BOOTH`,
      }
    : {
        subject: `HIBI BOOTH - Nhắc lịch chụp ${code}`,
        text: `Xin chào ${name},\n\nHIBI BOOTH nhắc bạn có lịch chụp lúc ${when} (giờ Việt Nam).\nMã đặt phòng: ${code}\nPhòng: ${roomName}\n\nVui lòng đến đúng giờ; check-in trễ tối đa 20 phút.\nXem và lưu lịch Google Calendar: ${calendarLink}\n\nHIBI BOOTH`,
      };
}

export async function scheduleBookingEmails(client, bookingId) {
  await client.query(`
    INSERT INTO email_notifications(booking_id,kind,recipient_email,due_at)
    SELECT b.id, 'CONFIRMATION', b.customer_email, NOW()
    FROM bookings b WHERE b.id=$1 AND b.status='CONFIRMED' AND b.payment_status='PAID'
      AND b.customer_email IS NOT NULL
      AND ((b.booking_date + b.time_slot::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') > NOW()
    ON CONFLICT (booking_id,kind) DO NOTHING
  `, [bookingId]);
  await client.query(`
    INSERT INTO email_notifications(booking_id,kind,recipient_email,due_at)
    SELECT b.id, 'REMINDER', b.customer_email,
      GREATEST(NOW(), ((b.booking_date + b.time_slot::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 hour')
    FROM bookings b WHERE b.id=$1 AND b.status='CONFIRMED' AND b.payment_status='PAID'
      AND b.customer_email IS NOT NULL
      AND ((b.booking_date + b.time_slot::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') > NOW()
    ON CONFLICT (booking_id,kind) DO NOTHING
  `, [bookingId]);
}

async function sendThroughResend({ to, subject, text, idempotencyKey }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(12000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id) throw new Error(`Resend rejected message (${response.status})`);
  return String(body.id);
}

export function emailServiceEnabled() {
  return EMAIL_PROVIDER === 'resend' && Boolean(RESEND_API_KEY && EMAIL_FROM);
}

export async function processEmailNotifications(pool) {
  if (!emailServiceEnabled()) return {processed:0,provider:'disabled'};
  let processed=0;
  for (let i=0; i<10; i++) {
    const client=await pool.connect();
    let job;
    try {
      await client.query('BEGIN');
      const result=await client.query(`
        SELECT n.id,n.booking_id,n.kind,n.recipient_email,n.attempts,
          b.booking_code,b.customer_name,b.booking_date::text AS booking_date,b.time_slot,
          b.status AS booking_status,b.payment_status,room.name AS room_name
        FROM email_notifications n
        JOIN bookings b ON b.id=n.booking_id JOIN rooms room ON room.id=b.room_id
        WHERE (n.status='PENDING' AND n.due_at<=NOW()) OR
              (n.status='SENDING' AND n.claimed_at < NOW()-INTERVAL '5 minutes')
        ORDER BY CASE WHEN n.kind='CONFIRMATION' THEN 0 ELSE 1 END,n.due_at,n.id
        LIMIT 1 FOR UPDATE OF n SKIP LOCKED
      `);
      if (!result.rowCount) {await client.query('COMMIT');break;}
      job=result.rows[0];
      await client.query(`UPDATE email_notifications SET status='SENDING',attempts=attempts+1,claimed_at=NOW() WHERE id=$1`,[job.id]);
      await client.query('COMMIT');
    } catch (error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
    processed++;
    const startMs=Date.parse(`${job.booking_date}T${job.time_slot}:00+07:00`);
    if (job.booking_status!=='CONFIRMED' || job.payment_status!=='PAID' ||
        !Number.isFinite(startMs) || startMs<=Date.now() || !isValidCustomerEmail(job.recipient_email)) {
      await pool.query("UPDATE email_notifications SET status='SKIPPED' WHERE id=$1",[job.id]);
      continue;
    }
    const {subject,text}=emailMessage(job.kind,job);
    try {
      const emailId=await sendThroughResend({
        to:job.recipient_email,subject,text,idempotencyKey:job.kind==='REMINDER' ? `hibi-reminder-${job.booking_id}-${job.booking_date}-${job.time_slot}` : `hibi-confirmation-${job.booking_id}`,
      });
      await pool.query(`UPDATE email_notifications SET status='SUBMITTED',sent_at=NOW(),provider_message_id=$2,error_message=NULL WHERE id=$1`,[job.id,emailId]);
    } catch (error) {
      const attempts=Number(job.attempts)+1;
      const retry=attempts<5;
      await pool.query(`UPDATE email_notifications SET status=$2,
        due_at=CASE WHEN $3 THEN NOW()+$4::interval ELSE due_at END,
        error_message=$5 WHERE id=$1`,
        [job.id,retry?'PENDING':'FAILED',retry,`${Math.min(attempts*2,10)} minutes`,String(error.message||error).slice(0,220)]);
      console.warn(`Gửi email HIBI thất bại, mã hàng đợi ${job.id}, lần ${attempts}.`);
    }
  }
  return {processed,provider:EMAIL_PROVIDER};
}

// Reschedule decisions are separate jobs: repeated schedule changes must each notify the customer.
export function rescheduleDecisionEmailMessage(job) {
  const [year,month,day] = String(job.new_booking_date).split('-');
  const [oldYear,oldMonth,oldDay] = String(job.old_booking_date).split('-');
  const revised = `${job.new_time_slot} ngày ${day}/${month}/${year}`;
  const original = `${job.old_time_slot} ngày ${oldDay}/${oldMonth}/${oldYear}`;
  const approved = job.decision_status==='APPROVED';
  return {
    subject:`HIBI BOOTH - ${approved?'Đổi lịch đã được duyệt':'Yêu cầu đổi lịch bị từ chối'} - ${job.booking_code}`,
    text: approved
      ? `Xin chào ${job.customer_name},\n\nYêu cầu đổi lịch ${job.booking_code} đã được duyệt.\nLịch cũ: ${original}.\nLịch mới: ${revised}.\nPhòng: ${job.room_name}.\n\nNếu bạn đã lưu lịch trên Google Calendar, vui lòng cập nhật sự kiện cũ.\nTạo sự kiện mới: ${googleCalendarUrl({bookingDate:job.new_booking_date,timeSlot:job.new_time_slot,bookingCode:job.booking_code,roomName:job.room_name})}\n\nHIBI BOOTH`
      : `Xin chào ${job.customer_name},\n\nYêu cầu đổi lịch ${job.booking_code} không được phê duyệt.\nLý do: ${job.decision_reason || 'Không được chấp thuận'}.\nLịch ban đầu vẫn giữ nguyên: ${original}.\nBạn có thể tra cứu đơn để xem kết quả.\n\nHIBI BOOTH`,
  };
}

export async function processRescheduleDecisionNotifications(pool) {
  if (!emailServiceEnabled()) return {processed:0, provider:'disabled'};
  let processed=0;
  for(let i=0;i<10;i++){
    const client=await pool.connect();
    let job;
    try {
      await client.query('BEGIN');
      const result=await client.query(`SELECT n.id,n.request_id,n.attempts,n.recipient_email,
        r.status AS decision_status,r.decision_reason,r.old_booking_date::text AS old_booking_date,
        r.old_time_slot,r.new_booking_date::text AS new_booking_date,r.new_time_slot,
        b.booking_code,b.customer_name,room.name AS room_name
        FROM reschedule_decision_notifications n
        JOIN booking_reschedule_requests r ON r.id=n.request_id
        JOIN bookings b ON b.id=r.booking_id JOIN rooms room ON room.id=b.room_id
        WHERE (n.status='PENDING' AND n.due_at<=NOW()) OR
          (n.status='SENDING' AND n.claimed_at < NOW()-INTERVAL '5 minutes')
        ORDER BY n.due_at,n.id LIMIT 1 FOR UPDATE OF n SKIP LOCKED`);
      if (!result.rowCount) {await client.query('COMMIT');break;}
      job=result.rows[0];
      await client.query(`UPDATE reschedule_decision_notifications
        SET status='SENDING', attempts=attempts+1,claimed_at=NOW() WHERE id=$1`,[job.id]);
      await client.query('COMMIT');
    } catch(error){await client.query('ROLLBACK');throw error;}
    finally {client.release();}
    processed++;
    if (!['APPROVED','REJECTED'].includes(job.decision_status) || !isValidCustomerEmail(job.recipient_email)) {
      await pool.query("UPDATE reschedule_decision_notifications SET status='SKIPPED' WHERE id=$1",[job.id]);
      continue;
    }
    const {subject,text}=rescheduleDecisionEmailMessage(job);
    try {
      const emailId=await sendThroughResend({to:job.recipient_email,subject,text,
        idempotencyKey:`hibi-reschedule-decision-${job.request_id}`});
      await pool.query(`UPDATE reschedule_decision_notifications SET
        status='SUBMITTED',sent_at=NOW(),provider_message_id=$2,error_message=NULL WHERE id=$1`,[job.id,emailId]);
    } catch(error) {
      const attempts=Number(job.attempts)+1;
      const retry=attempts<5;
      await pool.query(`UPDATE reschedule_decision_notifications SET status=$2,
        due_at=CASE WHEN $3 THEN NOW()+$4::interval ELSE due_at END,
        error_message=$5 WHERE id=$1`,
        [job.id,retry?'PENDING':'FAILED',retry,`${Math.min(attempts*2,10)} minutes`,String(error.message||error).slice(0,220)]);
      console.warn(`Thông báo đổi lịch HIBI thất bại, công việc ${job.id}, lần ${attempts}.`);
    }
  }
  return {processed,provider:EMAIL_PROVIDER};
}

export function startEmailNotificationWorker(pool) {
  if (!emailServiceEnabled()) {
    console.log('Email chưa kích hoạt: đặt EMAIL_PROVIDER=resend, RESEND_API_KEY và EMAIL_FROM trong server/.env.');
    return;
  }
  let running=false;
  const tick=async () => {
    if (running) return;
    running=true;
    try {await processEmailNotifications(pool);await processRescheduleDecisionNotifications(pool);}
    catch (error) {console.warn('Email worker gặp lỗi:',error.message);}
    finally {running=false;}
  };
  const timer=setInterval(tick,20_000);
  timer.unref?.();
  void tick();
}
