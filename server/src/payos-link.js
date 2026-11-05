/**
 * Resolve a pending payOS payment link without minting a second orderCode.
 * A database reservation can survive a failed provider CREATE. When the provider
 * explicitly says that orderCode does not exist (code 101), it is safe to retry
 * CREATE with the SAME orderCode. For transport/ambiguous errors, never guess.
 */
export class PayosLinkError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PayosLinkError';
    this.code = code;
  }
}

export function isPayosNotFound(error) {
  const codes = [error?.code, error?.error?.code, error?.data?.code, error?.response?.data?.code];
  if (codes.some((value) => String(value) === '101')) return true;
  const message = String(error?.message || '');
  return /\bcode\s*[:=]\s*101\b/i.test(message) && /kh[oô]ng t[oồ]n t[aạ]i|not found/i.test(message);
}

export function validPayosCheckoutUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'payos.vn' || url.hostname.endsWith('.payos.vn'));
  } catch { return false; }
}

function verifiedLink(response, { orderCode, amount }) {
  if (response?.orderCode != null && Number(response.orderCode) !== orderCode) {
    throw new PayosLinkError('ORDER_MISMATCH', 'payOS trả về mã giao dịch không khớp. Cần kiểm tra thủ công.');
  }
  if (response?.amount != null && Number(response.amount) !== amount) {
    throw new PayosLinkError('AMOUNT_MISMATCH', 'Số tiền payOS không khớp với đơn. Không thể tạo QR thanh toán.');
  }
  if (response?.currency && response.currency !== 'VND') {
    throw new PayosLinkError('CURRENCY_MISMATCH', 'Loại tiền tệ payOS không hợp lệ.');
  }
  if (response?.status && response.status !== 'PENDING') {
    throw new PayosLinkError('NOT_PENDING', 'Giao dịch payOS không còn ở trạng thái chờ thanh toán. Hãy tra cứu đơn.');
  }
  const qrContent = typeof response?.qrCode === 'string' && response.qrCode.length <= 4096 ? response.qrCode : '';
  const checkoutUrl = validPayosCheckoutUrl(response?.checkoutUrl) ? response.checkoutUrl : '';
  if (!qrContent && !checkoutUrl) {
    throw new PayosLinkError('NO_LINK', 'payOS không trả về mã QR hoặc đường dẫn thanh toán hợp lệ.');
  }
  return { qrContent, checkoutUrl, orderCode };
}

export async function recoverOrCreatePayosLink(payos, { orderCode, amount, holdExpiresAt, returnUrl, cancelUrl }, now = () => Date.now()) {
  if (!Number.isSafeInteger(orderCode) || orderCode <= 0 || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new PayosLinkError('INVALID_INPUT', 'Thông tin yêu cầu thanh toán không hợp lệ.');
  }
  const expiry = new Date(holdExpiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry <= now()) {
    throw new PayosLinkError('EXPIRED', 'Đã hết thời gian giữ chỗ. Không thể tạo QR mới.');
  }
  let notFound = false;
  try {
    const remote = await payos.paymentRequests.get(orderCode);
    return verifiedLink(remote, { orderCode, amount });
  } catch (error) {
    if (error instanceof PayosLinkError) throw error;
    if (!isPayosNotFound(error)) {
      throw new PayosLinkError('PROVIDER_UNAVAILABLE', 'Chưa xác minh được giao dịch trên payOS. Vui lòng thử lại sau.');
    }
    notFound = true;
  }
  if (!notFound || expiry <= now()) throw new PayosLinkError('EXPIRED', 'Đơn đã hết hạn giữ chỗ.');
  try {
    const remote = await payos.paymentRequests.create({
      orderCode, amount, description: `HIBI ${orderCode}`,
      returnUrl, cancelUrl, expiredAt: Math.floor(expiry / 1000),
    });
    return verifiedLink(remote, { orderCode, amount });
  } catch (error) {
    if (error instanceof PayosLinkError) throw error;
    // Another request might have created this SAME orderCode concurrently.
    // Re-read the provider; never generate a new code or assume success.
    try {
      const remote = await payos.paymentRequests.get(orderCode);
      return verifiedLink(remote, { orderCode, amount });
    } catch (recoveryError) {
      if (recoveryError instanceof PayosLinkError) throw recoveryError;
      throw new PayosLinkError('CREATE_FAILED', 'Chưa thể tạo hoặc khôi phục QR payOS. Vui lòng thử lại sau.');
    }
  }
}
