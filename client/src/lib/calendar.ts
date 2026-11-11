// Opens a pre-filled Google Calendar event. The customer must click Save in Google Calendar.
// No OAuth token, Google account access, or calendar write permission is required.
export function googleCalendarLink({date, timeSlot, bookingCode, roomName, durationMinutes = 30}: {
  date: string;
  timeSlot: string;
  bookingCode: string;
  roomName?: string;
  durationMinutes?: number;
}): string {
  const day = String(date).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(timeSlot)) return '';
  const start = Date.parse(`${day}T${timeSlot}:00+07:00`);
  if (!Number.isFinite(start) || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 240) return '';
  const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const params = new URLSearchParams({
    action:'TEMPLATE',
    text:'Lịch chụp ảnh HIBI BOOTH',
    dates:`${utc(start)}/${utc(start+durationMinutes*60_000)}`,
    stz:'Asia/Ho_Chi_Minh', etz:'Asia/Ho_Chi_Minh',
    details:`Mã đặt phòng: ${bookingCode}\nPhòng: ${roomName || 'HIBI BOOTH'}\nVui lòng đến đúng giờ. Check-in trễ tối đa 20 phút.`,
    location:'HIBI BOOTH',
  });
  return `https://calendar.google.com/calendar/r/eventedit?${params.toString()}`;
}
