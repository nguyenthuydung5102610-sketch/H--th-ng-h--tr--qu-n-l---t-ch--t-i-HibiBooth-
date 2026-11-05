/**
 * COMMIT 09: One authoritative, transaction-safe payOS payment transition for
 * both signed webhooks and server-to-server reconciliation.
 * No browser input may call this function to assert a payment.
 */
import { scheduleBookingEmails } from './email-notifications.js';
import { writeAudit } from './db.js';

export function validateVerifiedPayment({ orderCode, amount, reference, source, currency = 'VND' }) {
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0) return 'INVALID_ORDER';
  if (!Number.isSafeInteger(amount) || amount <= 0) return 'INVALID_AMOUNT';
  if (typeof reference !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(reference)) return 'INVALID_REFERENCE';
  if (!['WEBHOOK', 'RECONCILE'].includes(source)) return 'INVALID_SOURCE';
  if (currency !== 'VND') return 'INVALID_CURRENCY';
  return null;
}

/**
 * Validates payOS VERIFIED data against persisted booking/order, then performs
 * one database transaction. Rows are locked before status/amount checks;
 * SQL clock_timestamp() is authoritative at the hold-expiry boundary.
 *
 * `scheduleEmails` and `audit` are injectible for deterministic unit tests.
 */
export async function syncVerifiedPayosPayment(db, payment, {
  scheduleEmails = scheduleBookingEmails,
  audit = writeAudit,
} = {}) {
  const validationError = validateVerifiedPayment(payment);
  if (validationError) return { outcome: validationError };
  const { orderCode, amount, reference, source } = payment;
  const providerEventId = `${orderCode}:${reference}`;
  const client = await db.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    const found = await client.query(`
      SELECT b.id,b.booking_code,b.status,b.payment_status,b.amount_vnd,
        (b.hold_expires_at IS NOT NULL AND b.hold_expires_at > clock_timestamp()) AS hold_valid
      FROM payos_payment_requests p JOIN bookings b ON b.id=p.booking_id
      WHERE p.order_code=$1 FOR UPDATE OF b`, [orderCode]);
    if (!found.rowCount) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return {outcome:'UNKNOWN_ORDER'};
    }
    const b = found.rows[0];
    const writePaymentEvent = async (result = 'RECEIVED') => client.query(`
      INSERT INTO payment_events(booking_id,provider,provider_event_id,amount_vnd,result)
      VALUES ($1,'PAYOS',$2,$3,$4)
      ON CONFLICT(provider,provider_event_id) DO NOTHING RETURNING id`,
    [b.id,providerEventId,amount,result]);
    const recordReview = async (kind) => {
      await client.query(`INSERT INTO payment_reconciliation_cases
        (booking_id,order_code,transaction_ref,issue_type,observed_amount_vnd,source)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT(order_code,transaction_ref,issue_type) DO NOTHING`,
      [b.id,orderCode,reference,kind,amount,source]);
    };

    // Even a signed event for a known order must match the original payable amount.
    if (amount !== Number(b.amount_vnd)) {
      const inserted = await writePaymentEvent('AMOUNT_MISMATCH');
      await recordReview('AMOUNT_MISMATCH');
      if (inserted.rowCount) await audit(client,null,'PAYOS_AMOUNT_MISMATCH','BOOKING',b.id,{orderCode,reference,amount,expectedAmount:Number(b.amount_vnd),source});
      await client.query('COMMIT');
      inTransaction = false;
      return {outcome:'AMOUNT_MISMATCH',bookingCode:b.booking_code};
    }

    // A valid payment was processed already (possibly by the other channel).
    // Do not re-send email, change booking state, or create duplicate transactions.
    if (b.payment_status === 'PAID') {
      await client.query('COMMIT');
      inTransaction = false;
      // A paid booking that was later cancelled is NOT a valid room reservation.
      return {outcome:['CONFIRMED','CHECKED_IN'].includes(b.status)?'ALREADY_CONFIRMED':'ALREADY_PAID_CLOSED',
        bookingCode:b.booking_code,paymentStatus:'PAID'};
    }
    const inserted = await writePaymentEvent();
    if (!inserted.rowCount) {
      await client.query('COMMIT');
      inTransaction = false;
      return {outcome:'ALREADY_PROCESSED',bookingCode:b.booking_code,paymentStatus:b.payment_status};
    }

    if (b.status === 'PENDING_PAYMENT' && b.payment_status === 'PENDING' && b.hold_valid) {
      // Recheck with live DB time under the booking lock: no confirmation at/after expiry.
      const updated = await client.query(`UPDATE bookings
        SET status='CONFIRMED',payment_status='PAID',hold_expires_at=NULL,updated_at=clock_timestamp()
        WHERE id=$1 AND status='PENDING_PAYMENT' AND payment_status='PENDING'
        AND hold_expires_at > clock_timestamp() RETURNING id`,[b.id]);
      if (updated.rowCount) {
        await client.query("UPDATE payment_events SET result='VERIFIED' WHERE id=$1",[inserted.rows[0].id]);
        await scheduleEmails(client,b.id);
        await audit(client,null,'PAYOS_PAYMENT_CONFIRMED','BOOKING',b.id,{orderCode,reference,source});
        await client.query('COMMIT');
        inTransaction = false;
        return {outcome:'CONFIRMED',bookingCode:b.booking_code,paymentStatus:'PAID'};
      }
    }
    // A late transfer or cancelled/expired booking NEVER reclaims a room.
    await client.query("UPDATE payment_events SET result='REVIEW_REQUIRED' WHERE id=$1",[inserted.rows[0].id]);
    await recordReview('LATE_OR_INELIGIBLE');
    await audit(client,null,'PAYOS_LATE_PAYMENT_REVIEW','BOOKING',b.id,{orderCode,reference,source,status:b.status});
    await client.query('COMMIT');
    inTransaction = false;
    return {outcome:'REVIEW_REQUIRED',bookingCode:b.booking_code,paymentStatus:b.payment_status};
  } catch (error) {
    if (inTransaction) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
