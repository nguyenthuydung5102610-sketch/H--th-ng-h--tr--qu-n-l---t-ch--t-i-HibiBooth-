/** Cancellation rules, kept pure so exception branches are testable without payment or DB. */
export function cancellationMode(status, paymentStatus, options = {}) {
  if (status === 'PENDING_PAYMENT' && paymentStatus === 'PENDING') {
    if (Object.hasOwn(options, 'holdExpiresAt')) {
      const expiresAt = new Date(options.holdExpiresAt).getTime();
      if (options.holdExpiresAt == null || !Number.isFinite(expiresAt) || expiresAt <= (options.nowMs ?? Date.now())) {
        return 'EXPIRED';
      }
    }
    return 'IMMEDIATE';
  }
  if (status === 'CONFIRMED' && paymentStatus === 'PAID') return 'REVIEW';
  return 'BLOCKED';
}

export function isCancellationReasonValid(reason) {
  return typeof reason === 'string' && reason.trim().length >= 5 && reason.trim().length <= 500;
}

export function validateCancellationDecision(payload) {
  if (!payload || typeof payload !== 'object' || !['APPROVE', 'REJECT'].includes(payload.decision)) {
    return 'Chỉ chấp nhận quyết định APPROVE hoặc REJECT.';
  }
  const reason = payload.decisionReason;
  if (reason != null && (typeof reason !== 'string' || reason.trim().length > 500)) {
    return 'Lý do xét duyệt phải là văn bản tối đa 500 ký tự.';
  }
  if (payload.decision === 'REJECT' && (typeof reason !== 'string' || reason.trim().length < 5)) {
    return 'Khi từ chối phải nhập lý do ít nhất 5 ký tự.';
  }
  return null;
}

export function validateCancellationReview(requestStatus, bookingStatus, paymentStatus, decision) {
  if (requestStatus !== 'PENDING') return 'Yêu cầu đã được xử lý; hãy tải lại danh sách.';
  if (decision === 'APPROVE' && (bookingStatus !== 'CONFIRMED' || paymentStatus !== 'PAID')) {
    return 'Trạng thái đơn hoặc thanh toán đã thay đổi; không thể duyệt hủy.';
  }
  return null;
}

/** Rollback is best-effort; keep original failure when PostgreSQL connection is lost. */
export async function rollbackCancellation(client, error) {
  try { await client.query('ROLLBACK'); } catch { /* connection is already broken */ }
  throw error;
}
