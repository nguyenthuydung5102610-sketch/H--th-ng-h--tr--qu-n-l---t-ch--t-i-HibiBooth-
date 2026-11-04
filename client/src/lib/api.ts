const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = localStorage.getItem('hibi_token');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Không kết nối được máy chủ. Hãy kiểm tra backend ở cổng 4000.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `Yêu cầu thất bại (${response.status}).`);
  return payload as T;
}

export const post = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const patch = <T,>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) });
