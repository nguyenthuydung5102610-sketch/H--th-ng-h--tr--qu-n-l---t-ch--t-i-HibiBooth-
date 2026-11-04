import {useEffect,useState,type FormEvent} from 'react';
import {api,patch} from '../lib/api';
type Row={id:number;reason:string;status:string;decision_reason:string|null;booking_code:string;
 customer_name:string;customer_phone:string;booking_date:string;time_slot:string;
 booking_status:string;payment_status:string;amount_vnd:number;room_name:string};
export function CancellationManagementPage(){
 const [status,setStatus]=useState('PENDING');const [rows,setRows]=useState<Row[]>([]);
 const [selected,setSelected]=useState<Row|null>(null);const [decision,setDecision]=useState<'APPROVE'|'REJECT'>('APPROVE');
 const [reason,setReason]=useState('');const [modalError,setModalError]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function load(){try{const data=await api<{requests:Row[]}>(`/management/cancellation-requests?status=${status}`);setRows(data.requests);setError('');}catch(e){setRows([]);setError(e instanceof Error?e.message:'Không tải được yêu cầu.');}}
 useEffect(()=>{void load();},[status]);
 async function submit(e:FormEvent){e.preventDefault();if(!selected||busy)return;
   if(decision==='REJECT'&&reason.trim().length<5){setModalError('Lý do từ chối ít nhất 5 ký tự.');return;}
   setBusy(true);setModalError('');setError('');setMessage('');
   try{const r=await patch<{message:string}>(`/management/cancellation-requests/${selected.id}/decision`,{decision,decisionReason:reason.trim()});
     setMessage(r.message);setSelected(null);await load();}
   catch(e){setModalError(e instanceof Error?e.message:'Xử lý thất bại.');await load();}
   finally{setBusy(false);}
 }
 return <section><div className="content-heading"><div><span className="eyebrow">CANCELLATION</span><h1>Duyệt yêu cầu hủy đặt phòng</h1>
 <p>Chấp thuận sẽ hủy đơn và lập yêu cầu hoàn tiền. Chủ quán phải duyệt hoàn tiền riêng; không có giao dịch chuyển tiền tự động.</p></div></div>
 <div className="panel filter-panel"><div className="filter-row"><label>Trạng thái<select value={status} onChange={e=>setStatus(e.target.value)}>
 <option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Từ chối</option><option value="ALL">Tất cả</option>
 </select></label><button type="button" className="button primary" onClick={()=>void load()}>Làm mới</button></div></div>
 {error&&<div className="error-box" role="alert">{error}</div>}{message&&<div className="notice" role="status">{message}</div>}
 <div className="panel table-panel"><div className="table-title"><h3>Yêu cầu hủy</h3><span>{rows.length} kết quả</span></div><div className="table-scroll">
 <table><thead><tr><th>Đơn/Khách</th><th>Phòng/Lịch</th><th>Lý do</th><th>Trạng thái</th><th>Xử lý</th></tr></thead><tbody>
 {rows.map(r=><tr key={r.id}><td><strong>{r.booking_code}</strong><small>{r.customer_name} · {r.customer_phone}</small></td>
 <td>{r.room_name}<small>{r.booking_date.slice(0,10)} · {r.time_slot}</small></td><td>{r.reason}</td><td>{r.status}<small>{r.decision_reason}</small></td>
 <td>{r.status==='PENDING'?<div className="table-actions"><button type="button" className="button tiny primary" onClick={()=>{setSelected(r);setDecision('APPROVE');setReason('');setModalError('');}}>Duyệt hủy</button>
 <button type="button" className="button tiny light" onClick={()=>{setSelected(r);setDecision('REJECT');setReason('');setModalError('');}}>Từ chối</button></div>:'—'}</td></tr>)}
 {!rows.length&&<tr><td colSpan={5} className="empty-cell">Không có yêu cầu.</td></tr>}</tbody></table></div></div>
 {selected&&<div className="modal-backdrop"><form className="modal panel" onSubmit={submit}>
 <button type="button" className="modal-close" disabled={busy} onClick={()=>setSelected(null)} aria-label="Đóng">×</button>
 <h2>{decision==='APPROVE'?'Duyệt hủy đặt phòng':'Từ chối hủy'}</h2><p>{selected.booking_code} · {selected.customer_name}</p>
 {modalError&&<div className="error-box" role="alert">{modalError} <button type="button" className="button tiny light" onClick={()=>{setSelected(null);setModalError('');}}>Đóng và tải lại</button></div>}
 <label>Lý do phản hồi<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={500} minLength={decision==='REJECT'?5:undefined} required={decision==='REJECT'}/></label>
 <div className="notice notice-info">{decision==='APPROVE'?'Đơn sẽ bị hủy và giải phóng lịch. Hệ thống chỉ tạo yêu cầu hoàn tiền; KHÔNG chuyển tiền.':'Đơn giữ nguyên trạng thái.'}</div>
 <button className="button primary full" disabled={busy}>{busy?'Đang xử lý...':'Xác nhận'}</button></form></div>}
 </section>;
}
