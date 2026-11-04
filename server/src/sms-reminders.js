// Transactional SMS reminder scheduler. No SMS is sent unless provider explicitly configured.
// Uses Twilio's Messages REST endpoint; confirm Vietnam routing and pricing with provider.
const SMS_PROVIDER = (process.env.SMS_PROVIDER || 'disabled').toLowerCase();
const SMS_FROM = process.env.TWILIO_FROM || '';
const SMS_SID = process.env.TWILIO_ACCOUNT_SID || '';
const SMS_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';

export async function scheduleBookingReminder(client, bookingId) {
  // Booking creation >=30m before start means a 60m-before reminder is impossible for short-notice bookings.
  // In such cases enqueue an immediate SMS after confirmation instead.
  await client.query(`
    INSERT INTO sms_reminders(booking_id,phone_e164,due_at)
    SELECT id, '+84' || SUBSTRING(customer_phone FROM 2),
      GREATEST(NOW(), ((booking_date + time_slot::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '1 hour')
    FROM bookings
    WHERE id=$1 AND status='CONFIRMED' AND payment_status='PAID'
      AND ((booking_date + time_slot::time) AT TIME ZONE 'Asia/Ho_Chi_Minh') > NOW()
    ON CONFLICT (booking_id) DO NOTHING
  `, [bookingId]);
}

async function sendTwilioSms(destination, body) {
  if (!SMS_SID || !SMS_TOKEN || !SMS_FROM) throw new Error('Thiếu cấu hình Twilio');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const result = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(SMS_SID)}/Messages.json`, {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + Buffer.from(`${SMS_SID}:${SMS_TOKEN}`).toString('base64'),
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: destination, From: SMS_FROM, Body: body }),
      signal: controller.signal,
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok || !data.sid) throw new Error(`SMS provider rejected request (${result.status})`);
    return data.sid;
  } finally { clearTimeout(timeout); }
}

export async function processSmsReminders(pool) {
  if (SMS_PROVIDER !== 'twilio') return { processed: 0, provider: 'disabled' };
  if (!SMS_SID || !SMS_TOKEN || !SMS_FROM) {
    console.warn('SMS_PROVIDER=twilio nhưng thiếu khóa/TWILIO_FROM: chưa gửi SMS.');
    return {processed:0,provider:'unconfigured'};
  }
  let processed=0;
  for (let i=0;i<10;i++) {
    const client = await pool.connect();
    let reminder;
    try {
      await client.query('BEGIN');
      const found = await client.query(`
        SELECT r.id,r.booking_id,r.phone_e164,r.attempts,r.due_at,
          b.booking_code,b.booking_date::text AS booking_date,b.time_slot,b.status AS booking_status,
          b.payment_status,r.status AS reminder_status
        FROM sms_reminders r JOIN bookings b ON b.id=r.booking_id
        WHERE ((r.status='PENDING' AND r.due_at<=NOW()) OR
               (r.status='SENDING' AND r.claimed_at<NOW()-INTERVAL '5 minutes'))
        ORDER BY r.due_at, r.id LIMIT 1 FOR UPDATE OF r SKIP LOCKED
      `);
      if (!found.rowCount) { await client.query('COMMIT'); break; }
      reminder=found.rows[0];
      await client.query(`UPDATE sms_reminders SET status='SENDING',attempts=attempts+1,claimed_at=NOW()
        WHERE id=$1`,[reminder.id]);
      await client.query('COMMIT');
    } catch(err){await client.query('ROLLBACK');throw err;}
    finally {client.release();}
    processed++;
    if (reminder.booking_status!=='CONFIRMED' || reminder.payment_status!=='PAID') {
      await pool.query("UPDATE sms_reminders SET status='SKIPPED' WHERE id=$1",[reminder.id]);
      continue;
    }
    const [year,month,day]=reminder.booking_date.split('-');
    const startTime=new Date(`${reminder.booking_date}T${reminder.time_slot}:00+07:00`);
    if (startTime.getTime() <= Date.now()) {
      await pool.query("UPDATE sms_reminders SET status='SKIPPED' WHERE id=$1",[reminder.id]);
      continue;
    }
    const message=`HIBI BOOTH: Nhac lich chup anh ${reminder.time_slot} ngay ${day}/${month}/${year}. Ma dat phong ${reminder.booking_code}. Vui long den dung gio. Tre qua 20 phut khong duoc check-in.`;
    try {
      const sid=await sendTwilioSms(reminder.phone_e164,message);
      // Accepted by Twilio, not proof of handset delivery. Delivery status callbacks are not integrated.
      await pool.query(`UPDATE sms_reminders SET status='SUBMITTED',sent_at=NOW(),provider_message_id=$2,error_message=NULL WHERE id=$1`,[reminder.id,sid]);
    } catch (err) {
      const attempts=Number(reminder.attempts)+1;
      const retry=attempts<5;
      await pool.query(`UPDATE sms_reminders SET status=$2,due_at=CASE WHEN $3 THEN NOW()+$4::interval ELSE due_at END,
        error_message=$5 WHERE id=$1`,[reminder.id,retry?'PENDING':'FAILED',retry,`${Math.min(attempts*2,10)} minutes`,String(err.message||err).slice(0,220)]);
      // Avoid exposing destination, token or personal information in logs.
      console.warn(`Không gửi được nhắc lịch SMS id=${reminder.id} (lần ${attempts}).`);
    }
  }
  return {processed,provider:SMS_PROVIDER};
}

export function startSmsReminderWorker(pool) {
  if (SMS_PROVIDER !== 'twilio') {
    console.log('SMS chưa kích hoạt: bật SMS_PROVIDER=twilio và nhập cấu hình trong server/.env.');
    return;
  }
  let running=false;
  const tick=async()=>{
    if(running)return;
    running=true;
    try {await processSmsReminders(pool);} catch(err){console.warn('SMS worker gặp lỗi:',err.message);} finally {running=false;}
  };
  const timer=setInterval(tick,30000);
  timer.unref?.();
  void tick();
}
