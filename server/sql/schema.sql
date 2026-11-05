CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS packages (
  id SERIAL PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('EMPLOYEE', 'OWNER')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  booking_code VARCHAR(32) UNIQUE NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_phone VARCHAR(30) NOT NULL,
  room_id INTEGER NOT NULL REFERENCES rooms(id),
  package_id INTEGER NOT NULL REFERENCES packages(id),
  booking_date DATE NOT NULL,
  time_slot VARCHAR(20) NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING_PAYMENT'
    CHECK (status IN ('PENDING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'EXPIRED')),
  payment_status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (payment_status IN ('PENDING', 'PAID', 'REFUND_PENDING', 'REFUNDED', 'FAILED')),
  hold_expires_at TIMESTAMPTZ,
  checked_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bookings_date_room_slot ON bookings(booking_date, room_id, time_slot);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
-- COMMIT 08: partial index for the automatic hold-expiration worker.
CREATE INDEX IF NOT EXISTS idx_bookings_expiring_holds
  ON bookings(hold_expires_at,id)
  WHERE status='PENDING_PAYMENT' AND payment_status='PENDING';

CREATE TABLE IF NOT EXISTS refunds (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  reason TEXT NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING_APPROVAL'
    CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(80),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Thử nghiệm thanh toán: tách bản ghi sự kiện, chống xử lý cùng mã giao dịch hai lần.
-- Khi nối payOS, provider='PAYOS', provider_event_id là mã duy nhất từ nhà cung cấp.
CREATE TABLE IF NOT EXISTS payment_events (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id),
  provider VARCHAR(20) NOT NULL,
  provider_event_id VARCHAR(120) NOT NULL,
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd >= 0),
  result VARCHAR(40) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_event_id)
);

-- COMMIT 09: durable manual reconciliation queue for verified but unallocatable
-- or mismatched payments. Never mark these as paid automatically.
CREATE TABLE IF NOT EXISTS payment_reconciliation_cases (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id),
  order_code BIGINT NOT NULL,
  transaction_ref VARCHAR(100) NOT NULL,
  issue_type VARCHAR(30) NOT NULL
    CHECK(issue_type IN ('AMOUNT_MISMATCH','LATE_OR_INELIGIBLE')),
  observed_amount_vnd INTEGER NOT NULL CHECK(observed_amount_vnd > 0),
  source VARCHAR(16) NOT NULL CHECK(source IN ('WEBHOOK','RECONCILE')),
  status VARCHAR(16) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','RESOLVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(order_code,transaction_ref,issue_type)
);
CREATE INDEX IF NOT EXISTS idx_payment_review_open
  ON payment_reconciliation_cases(status,created_at DESC);

-- Atomic counter per issuance date (Asia/Ho_Chi_Minh), preserves legacy booking codes.
CREATE TABLE IF NOT EXISTS booking_daily_sequences (
  issue_date DATE PRIMARY KEY,
  last_number BIGINT NOT NULL CHECK (last_number > 0)
);

-- SMS reminders (queued after verified payment; due 1h before booking, or immediately for shorter notice).
CREATE TABLE IF NOT EXISTS sms_reminders (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT UNIQUE NOT NULL REFERENCES bookings(id),
  phone_e164 VARCHAR(16) NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENDING','SUBMITTED','FAILED','SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id VARCHAR(120),
  error_message VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sms_reminders_due ON sms_reminders(status,due_at);


-- One payOS orderCode per booking. Safe to apply with db:init to an existing database.
CREATE SEQUENCE IF NOT EXISTS payos_order_code_seq START WITH 1000000;
CREATE TABLE IF NOT EXISTS payos_payment_requests (
  booking_id BIGINT PRIMARY KEY REFERENCES bookings(id),
  order_code BIGINT NOT NULL UNIQUE DEFAULT nextval('payos_order_code_seq'),
  qr_code TEXT,
  checkout_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Email is requested for booking confirmations and reminders; nullable for legacy bookings.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_email VARCHAR(254);

-- Exactly one confirmation and one 60-minute reminder per confirmed booking.
-- SUBMITTED means the email provider accepted the message, not confirmed inbox delivery.
CREATE TABLE IF NOT EXISTS email_notifications (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id),
  kind VARCHAR(16) NOT NULL CHECK (kind IN ('CONFIRMATION', 'REMINDER')),
  recipient_email VARCHAR(254) NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SENDING','SUBMITTED','FAILED','SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id VARCHAR(120),
  error_message VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_email_notifications_due ON email_notifications(status, due_at);

-- COMMIT 02: Luu yeu cau doi lich, khong thay doi booking truoc khi phe duyet.
-- Moi booking chi duoc co toi da mot yeu cau dang cho xu ly.
CREATE TABLE IF NOT EXISTS booking_reschedule_requests (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id),
  requested_by VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER'
    CHECK (requested_by IN ('CUSTOMER', 'EMPLOYEE', 'OWNER')),
  old_booking_date DATE NOT NULL,
  old_time_slot VARCHAR(20) NOT NULL,
  new_booking_date DATE NOT NULL,
  new_time_slot VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status VARCHAR(24) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by INTEGER REFERENCES users(id),
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT chk_reschedule_time_changed CHECK (
    old_booking_date <> new_booking_date OR old_time_slot <> new_time_slot
  ),
  CONSTRAINT chk_reschedule_review_fields CHECK (
    (status = 'PENDING' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status = 'CANCELLED' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('APPROVED', 'REJECTED') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_reschedule_one_pending_per_booking
  ON booking_reschedule_requests (booking_id)
  WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_reschedule_requests_status_created
  ON booking_reschedule_requests (status, created_at DESC);


-- COMMIT 04: Outbox for approval/rejection notices, one message per request.
-- Does not assert that an email has been delivered.
CREATE TABLE IF NOT EXISTS reschedule_decision_notifications (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT UNIQUE NOT NULL REFERENCES booking_reschedule_requests(id),
  recipient_email VARCHAR(254) NOT NULL,
  due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SENDING','SUBMITTED','FAILED','SKIPPED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  provider_message_id VARCHAR(120),
  error_message VARCHAR(240),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reschedule_decision_notifications_due
  ON reschedule_decision_notifications(status, due_at);


-- COMMIT 06: yêu cầu hủy đơn đã thanh toán (chờ nhân viên/chủ quán xét duyệt).
CREATE TABLE IF NOT EXISTS booking_cancellation_requests (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id),
  reason VARCHAR(500) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  reviewed_by INTEGER REFERENCES users(id),
  decision_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_cancel_pending
  ON booking_cancellation_requests(booking_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_booking_cancel_status
  ON booking_cancellation_requests(status,created_at DESC);
