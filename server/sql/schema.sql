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
