import { useEffect, useState, type FormEvent } from 'react';
import { api, patch } from '../lib/api';

type RequestRow = {
  id: number; booking_code: string; customer_name: string; customer_phone: string;
  room_name: string; old_booking_date: string; old_time_slot: string;
  new_booking_date: string; new_time_slot: string; reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decision_reason: string | null; reviewer_name: string | null;
  created_at: string; reviewed_at: string | null;
};
const labels: Record<string,string> = { PENDING:'Chờ xét duyệt', APPROVED:'Đã chấp thuận', REJECTED:'Đã từ chối', CANCELLED:'Đã hủy' };
const dateText = (date: string) => date ? date.slice(0,10).split('-').reverse().join('/') : '—';

/** Dùng chung cho EMPLOYEE / OWNER; backend luôn xác thực JWT và quyền trên từng yêu cầu. */
export function RescheduleManagementPage() {
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [selected, setSelected] = useState<RequestRow | null>(null);
  const [decision, setDecision] = useState<'APPROVE'|'REJECT'>('APPROVE');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function load(currentStatus = status) {
    try {
      const data = await api<{requests:RequestRow[]}>(`/management/reschedule-requests?status=${encodeURIComponent(currentStatus)}`);
      setRows(data.requests);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được yêu cầu đổi lịch.'); }
  }
  useEffect(() => { void load(status); }, [status]);

  function open(row:RequestRow, choice:'APPROVE'|'REJECT') {
    setError(''); setMessage(''); setSelected(row); setDecision(choice); setReason('');
  }
  async function submit(e:FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    if (decision === 'REJECT' && reason.trim().length < 5) {
      setError('Vui lòng ghi lý do từ chối ít nhất 5 ký tự.'); return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await patch<{message:string}>(`/management/reschedule-requests/${selected.id}/decision`,
        { decision, decisionReason: reason.trim() });
      setMessage(response.message);
      setSelected(null);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể xử lý yêu cầu.'); await load(); }
    finally { setBusy(false); }
  }

  return <section><div className="content-heading"><div><span className="eyebrow">RESCHEDULE APPROVAL</span><h1>Xét duyệt đổi lịch</h1>
    <p>Kiểm tra yêu cầu từ khách, duyệt hoặc từ chối. Nếu phòng vừa được đặt, hệ thống sẽ chặn phê duyệt để tránh trùng lịch.</p></div></div>
    <div className="panel filter-panel"><div className="filter-row"><label>Trạng thái
      <select value={status} onChange={e => setStatus(e.target.value)}>
        <option value="PENDING">Chờ xét duyệt</option><option value="APPROVED">Đã chấp thuận</option>
        <option value="REJECTED">Đã từ chối</option><option value="CANCELLED">Đã hủy</option><option value="ALL">Tất cả</option>
      </select></label><button className="button primary" type="button" onClick={() => {setError('');void load();}}>Làm mới</button></div></div>
    {error && <div className="error-box" role="alert">{error}</div>}
    {message && <div className="notice" role="status">{message}</div>}
    <div className="panel table-panel"><div className="table-title"><h3>Yêu cầu đổi lịch</h3><span>{rows.length} kết quả</span></div>
      <div className="table-scroll"><table><thead><tr><th>Đơn / Khách</th><th>Phòng</th><th>Lịch hiện tại</th><th>Lịch đề xuất</th><th>Lý do & trạng thái</th><th>Thao tác</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.booking_code}</strong><small>{row.customer_name} · {row.customer_phone}</small></td>
          <td>{row.room_name}</td><td>{dateText(row.old_booking_date)}<small>{row.old_time_slot}</small></td>
          <td>{dateText(row.new_booking_date)}<small>{row.new_time_slot}</small></td>
          <td><span className="status">{labels[row.status] || row.status}</span><small>{row.reason}</small>
            {row.decision_reason && <small>Lý do xử lý: {row.decision_reason}</small>}
            {row.reviewer_name && <small>Người duyệt: {row.reviewer_name}</small>}</td>
          <td>{row.status==='PENDING' ? <div className="table-actions">
            <button type="button" className="button tiny primary" onClick={() => open(row,'APPROVE')}>Duyệt</button>
            <button type="button" className="button tiny light" onClick={() => open(row,'REJECT')}>Từ chối</button>
          </div> : '—'}</td></tr>)}
          {!rows.length && <tr><td colSpan={6} className="empty-cell">Không có yêu cầu ở trạng thái này.</td></tr>}</tbody></table></div></div>
    {selected && <div className="modal-backdrop"><form className="modal panel" onSubmit={submit}>
      <button type="button" className="modal-close" onClick={() => !busy && setSelected(null)} disabled={busy} aria-label="Đóng">×</button>
      <span className="eyebrow">XÁC NHẬN XỬ LÝ</span><h2>{decision==='APPROVE'?'Chấp thuận đổi lịch':'Từ chối đổi lịch'}</h2>
      <p>Đơn <strong>{selected.booking_code}</strong> · {selected.customer_name}</p>
      <p>Lịch cũ: {dateText(selected.old_booking_date)} {selected.old_time_slot}<br/>Lịch mới: {dateText(selected.new_booking_date)} {selected.new_time_slot}</p>
      <label>Lý do {decision==='REJECT'?'(bắt buộc, ít nhất 5 ký tự)':'(không bắt buộc)'}
        <textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} required={decision==='REJECT'} minLength={decision==='REJECT'?5:undefined}/></label>
      <div className="notice notice-info">{decision==='APPROVE'?'Hệ thống sẽ kiểm tra phòng trống lại trước khi ghi lịch mới.':'Lịch đặt hiện tại của khách sẽ được giữ nguyên.'}</div>
      <button className="button primary full" disabled={busy}>{busy?'Đang xử lý...':'Xác nhận '+(decision==='APPROVE'?'duyệt':'từ chối')}</button>
    </form></div>}
  </section>;
}
