// COMMIT 15 - Transactional owner refund decisions.
// This is an APPROVAL workflow only: no bank/payment-provider payout occurs here.
export class RefundDecisionError extends Error {
  constructor(message, status = 409) {
    super(message);
    this.name = 'RefundDecisionError';
    this.status = status;
  }
}

export function validateRefundDecision({ refundId, ownerId, decision }) {
  if (!['APPROVE', 'REJECT'].includes(decision)) {
    throw new RefundDecisionError('Quyết định không hợp lệ.', 400);
  }
  if (!Number.isSafeInteger(Number(refundId)) || Number(refundId) < 1 ||
      !Number.isSafeInteger(Number(ownerId)) || Number(ownerId) < 1) {
    throw new RefundDecisionError('Mã yêu cầu hoặc người duyệt không hợp lệ.', 400);
  }
}

// Lock order is always booking -> refund, matching staff refund-request creation.
// A fresh check after the booking lock prevents concurrent approvals for one booking.
export async function decideRefundTransaction({ pool, refundId, ownerId, decision, writeAudit }) {
  validateRefundDecision({ refundId, ownerId, decision });
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;

    const link = await client.query('SELECT booking_id FROM refunds WHERE id=$1', [refundId]);
    if (!link.rowCount) throw new RefundDecisionError('Không tìm thấy yêu cầu hoàn tiền.', 404);

    const bookingResult = await client.query(
      'SELECT id,booking_code,payment_status FROM bookings WHERE id=$1 FOR UPDATE',
      [link.rows[0].booking_id],
    );
    if (!bookingResult.rowCount) throw new RefundDecisionError('Không tìm thấy đơn đặt phòng.', 409);
    const booking = bookingResult.rows[0];

    const refundResult = await client.query(
      'SELECT id,booking_id,amount_vnd,status FROM refunds WHERE id=$1 FOR UPDATE',
      [refundId],
    );
    if (!refundResult.rowCount || refundResult.rows[0].status !== 'PENDING_APPROVAL') {
      throw new RefundDecisionError('Yêu cầu không còn ở trạng thái chờ duyệt.', 409);
    }
    const refund = refundResult.rows[0];
    if (Number(refund.booking_id) !== Number(booking.id)) {
      throw new RefundDecisionError('Dữ liệu yêu cầu không đồng nhất.', 409);
    }

    if (decision === 'APPROVE') {
      if (booking.payment_status !== 'PAID') {
        throw new RefundDecisionError('Trạng thái thanh toán đã thay đổi. Vui lòng đối soát trước khi duyệt.', 409);
      }
      const previous = await client.query(
        "SELECT id FROM refunds WHERE booking_id=$1 AND id<>$2 AND status IN ('APPROVED','COMPLETED') LIMIT 1",
        [booking.id, refundId],
      );
      if (previous.rowCount) {
        throw new RefundDecisionError('Đơn này đã có yêu cầu hoàn tiền được duyệt.', 409);
      }
    }

    const status = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const updated = await client.query(
      `UPDATE refunds SET status=$1,approved_by=$2,decided_at=NOW()
       WHERE id=$3 AND status='PENDING_APPROVAL'
       RETURNING id,booking_id,amount_vnd,status`,
      [status, ownerId, refundId],
    );
    if (updated.rowCount !== 1) {
      throw new RefundDecisionError('Yêu cầu đã được xử lý bởi người khác.', 409);
    }

    if (decision === 'APPROVE') {
      const bookingUpdated = await client.query(
        `UPDATE bookings SET payment_status='REFUND_PENDING',updated_at=NOW()
         WHERE id=$1 AND payment_status='PAID' RETURNING id`,
        [booking.id],
      );
      if (bookingUpdated.rowCount !== 1) {
        throw new RefundDecisionError('Trạng thái thanh toán đã thay đổi khi phê duyệt.', 409);
      }
    }

    await writeAudit(client, ownerId,
      decision === 'APPROVE' ? 'APPROVE_REFUND' : 'REJECT_REFUND',
      'REFUND', updated.rows[0].id,
      {bookingCode:booking.booking_code,amountVnd:Number(updated.rows[0].amount_vnd)});
    await client.query('COMMIT');
    inTransaction = false;
    return {
      ...updated.rows[0],
      message: decision === 'APPROVE'
        ? 'Đã duyệt yêu cầu hoàn tiền. Chưa chuyển tiền; cần thực hiện và đối soát hoàn tiền riêng.'
        : 'Đã từ chối yêu cầu hoàn tiền.',
    };
  } catch (error) {
    if (inTransaction) {
      // A rollback error must not hide the original failure.
      try { await client.query('ROLLBACK'); } catch { /* preserve error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}
