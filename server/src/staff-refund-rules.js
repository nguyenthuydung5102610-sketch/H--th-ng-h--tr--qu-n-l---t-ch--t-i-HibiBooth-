// Shared eligibility for staff refund requests. Refund approval and actual
// money transfers are separate operations controlled by the owner/provider.
import { canRequestRefundAssistance } from './refund-assistance.js';

export function staffRefundEligibility(booking, nowMs = Date.now()) {
  if (!booking) {
    return { allowed: false, reason: 'NOT_FOUND', message: 'Không tìm thấy đơn đặt phòng.' };
  }
  // EXPIRED/PENDING is an unpaid hold. It must never become a refund request.
  if (booking.payment_status !== 'PAID') {
    return { allowed: false, reason: 'NOT_PAID', message: 'Đơn chưa thanh toán hoặc đã chuyển sang quy trình hoàn tiền; không thể gửi yêu cầu hoàn tiền mới.' };
  }
  if (booking.refund_request_exists) {
    return { allowed: false, reason: 'ALREADY_REQUESTED', message: 'Đơn đã có yêu cầu hoàn tiền đang xử lý hoặc đã được duyệt.' };
  }
  if (!canRequestRefundAssistance(booking, nowMs)) {
    return { allowed: false, reason: 'NOT_OVERDUE', message: 'Chỉ đề nghị hoàn tiền cho đơn đã thanh toán nhưng quá 20 phút giờ check-in, khách không đến hoặc đơn đã hủy.' };
  }
  return { allowed: true, reason: 'ELIGIBLE', message: 'Được phép gửi đề nghị hoàn tiền để chủ quán xét duyệt.' };
}
