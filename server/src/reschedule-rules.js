import { isBookableAt, isValidDate } from './business-rules.js';

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
