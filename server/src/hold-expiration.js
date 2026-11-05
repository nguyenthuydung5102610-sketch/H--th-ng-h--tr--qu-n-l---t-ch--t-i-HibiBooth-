/**
 * COMMIT 08 - Expire unpaid room holds.
 * PostgreSQL is the authority for deadlines; workers only transition PENDING/PENDING.
 * For verified payments received after expiry, the payment integration keeps
 * REVIEW_REQUIRED (manual reconciliation), never reassigns a room automatically.
 */

export const HOLD_MINUTES = 20;
export const HOLD_WORKER_INTERVAL_MS = 15_000;
export const HOLD_BATCH_SIZE = 50;

/** Pure rule for unit tests/UI expectations, never used in place of SQL's NOW(). */
export function shouldExpireHold(status, paymentStatus, holdExpiresAt, nowMs = Date.now()) {
  if (status !== 'PENDING_PAYMENT' || paymentStatus !== 'PENDING') return false;
  if (holdExpiresAt == null) return true; // Missing expiry is an invalid reservation.
  const deadline = new Date(holdExpiresAt).getTime();
  return !Number.isFinite(deadline) || deadline <= nowMs;
}

/**
 * Call inside an already-open transaction, with the booking row locked FOR UPDATE.
 * Used when customer cancellation reaches the expiry boundary before the worker.
 */
export async function expireLockedHold(client, bookingId) {
  const updated = await client.query(`UPDATE bookings
    SET status='EXPIRED', updated_at=NOW()
    WHERE id=$1 AND status='PENDING_PAYMENT' AND payment_status='PENDING'
      AND (hold_expires_at IS NULL OR hold_expires_at<=NOW())
    RETURNING id,booking_code`, [bookingId]);
  if (!updated.rowCount) return false;
  await client.query(`INSERT INTO audit_logs(user_id,action,entity_type,entity_id,details)
    VALUES(NULL,'HOLD_EXPIRED','BOOKING',$1,jsonb_build_object('bookingCode',$2,'reason','hold_timeout'))`,
    [String(updated.rows[0].id),updated.rows[0].booking_code]);
  return true;
}

/**
 * Transactionally lock a small batch; SKIP LOCKED avoids blocking a concurrent
 * verified-payment webhook and permits multiple app instances without double expiry.
 * On any DB error the entire batch rolls back, so a retry is safe.
 */
export async function expireOverdueHolds(db, { limit = HOLD_BATCH_SIZE, bookingCode = null } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new RangeError('Hold expiration batch size must be 1..200');
  if (bookingCode != null && (typeof bookingCode !== 'string' || !bookingCode))
    throw new TypeError('bookingCode must be a nonempty string');
  const client = await db.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const due = await client.query(`SELECT id,booking_code
      FROM bookings
      WHERE status='PENDING_PAYMENT' AND payment_status='PENDING'
        AND (hold_expires_at IS NULL OR hold_expires_at<=NOW())
        AND ($2::text IS NULL OR booking_code=$2)
      ORDER BY hold_expires_at NULLS FIRST,id
      LIMIT $1 FOR UPDATE SKIP LOCKED`,[limit,bookingCode]);
    const expired = [];
    for (const row of due.rows) {
      // Recheck against the database clock while holding the row lock.
      if (await expireLockedHold(client,row.id)) expired.push(row.booking_code);
    }
    await client.query('COMMIT');
    transactionStarted = false;
    return {expired:expired.length,bookingCodes:expired};
  } catch (error) {
    if (transactionStarted) {
      try { await client.query('ROLLBACK'); } catch { /* preserve the original error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Recover automatically from transient database failures; do not overlap ticks. */
export function createHoldExpirationWorker(db, {
  intervalMs = HOLD_WORKER_INTERVAL_MS,
  batchSize = HOLD_BATCH_SIZE,
  onError = (error) => console.error('Lỗi xử lý hết hạn giữ chỗ:',error),
  expireFn = expireOverdueHolds,
} = {}) {
  let timer = null;
  let running = false;
  let stopped = false;
  async function tick() {
    if (stopped || running) return {skipped:true};
    running = true;
    let count = 0;
    try {
      // Drain at most 4 batches per tick to avoid monopolising DB connections.
      for (let i=0;i<4;i++) {
        const result = await expireFn(db,{limit:batchSize});
        count += result.expired;
        if (result.expired < batchSize) break;
      }
      return {expired:count};
    } catch (error) {
      onError(error);
      return {expired:count,error};
    } finally {
      running = false;
    }
  }
  function start() {
    if (timer || stopped) return;
    timer = setInterval(() => {void tick();},intervalMs);
    timer.unref?.();
    void tick(); // cleanup after process restart without waiting the first interval
  }
  function stop() {
    stopped = true;
    if (timer) clearInterval(timer);
    timer = null;
  }
  return {start,stop,tick};
}
