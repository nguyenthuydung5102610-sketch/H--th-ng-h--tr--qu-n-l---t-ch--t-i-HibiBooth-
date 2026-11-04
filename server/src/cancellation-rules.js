/** Pure business rules for customer cancellation (Commit 06). */
export function cancellationMode(status, paymentStatus) {
  if (status === 'PENDING_PAYMENT' && paymentStatus === 'PENDING') return 'IMMEDIATE';
  if (status === 'CONFIRMED' && paymentStatus === 'PAID') return 'REVIEW';
  return 'BLOCKED';
}
export function isCancellationReasonValid(reason) {
  return typeof reason === 'string' && reason.trim().length >= 5 && reason.trim().length <= 500;
}
