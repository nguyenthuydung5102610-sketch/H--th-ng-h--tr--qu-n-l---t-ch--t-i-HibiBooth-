import { isBookableAt, isValidDate, slotsOverlap } from './business-rules.js';

export function normalizeCustomerPhone(value) {
  if (typeof value !== 'string') return null;
  const phone = value.replace(/[\s.-]/g, '');
  return /^(03|05|07|08|09)\d{8}$/.test(phone) ? phone : null;
}

export function validateRescheduleInput(input, validSlots, nowMs = Date.now()) {
  if (!input || typeof input !== 'object') return 'Thiếu thông tin đổi lịch.';
  if (!normalizeCustomerPhone(input.customerPhone)) return 'Vui lòng nhập đúng số điện thoại đã đặt phòng.';
  if (!isValidDate(input.newDate)) return 'Ngày đổi lịch không hợp lệ.';
  if (!Array.isArray(validSlots) || !validSlots.includes(input.newTimeSlot)) return 'Khung giờ đổi lịch không hợp lệ.';
  if (!isBookableAt(input.newDate, input.newTimeSlot, nowMs)) return 'Khung giờ mới phải cách thời điểm hiện tại ít nhất 30 phút.';
  if (typeof input.reason !== 'string' || input.reason.trim().length < 5 || input.reason.trim().length > 500) {
    return 'Vui lòng nhập lý do đổi lịch từ 5 đến 500 ký tự.';
  }
  return null;
}

export function canRequestReschedule(status, paymentStatus) {
  return status === 'CONFIRMED' && paymentStatus === 'PAID';
}

// Approval is a distinct XOR decision after the customer submits the request.
export function validateRescheduleDecision(input) {
  if (!input || !['APPROVE','REJECT'].includes(input.decision)) return 'Quyết định phải là APPROVE hoặc REJECT.';
  if (input.decisionReason != null && (typeof input.decisionReason !== 'string' || input.decisionReason.length > 500)) {
    return 'Lý do xét duyệt không hợp lệ (tối đa 500 ký tự).';
  }
  if (input.decision === 'REJECT' && (typeof input.decisionReason !== 'string' || input.decisionReason.trim().length < 5)) {
    return 'Khi từ chối cần nhập lý do ít nhất 5 ký tự.';
  }
  return null;
}

export function canApproveReschedule(date, slot, validSlots, nowMs = Date.now()) {
  return Array.isArray(validSlots) && validSlots.includes(slot) && isBookableAt(date, slot, nowMs);
}

// UI pre-check only. Server approval uses locks and always validates again.
export function unavailableRescheduleSlots(timeSlots, reservedSlots, date, nowMs = Date.now()) {
  return timeSlots.filter(slot => !isBookableAt(date, slot, nowMs) ||
    reservedSlots.some(existing => slotsOverlap(slot, existing)));
}
