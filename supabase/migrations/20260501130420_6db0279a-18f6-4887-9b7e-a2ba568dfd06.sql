
-- 1. Add Kandivali to branch enum
ALTER TYPE branch ADD VALUE IF NOT EXISTS 'Kandivali';

-- 2. Memberships table
CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expires_at DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 year'),
  active BOOLEAN NOT NULL DEFAULT true,
  amount_paid INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memberships_phone ON public.memberships(phone);
CREATE INDEX IF NOT EXISTS idx_memberships_active_exp ON public.memberships(active, expires_at);

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- public can check by phone (needed for auto-detect at booking)
CREATE POLICY "Anyone can read memberships"
ON public.memberships FOR SELECT TO anon, authenticated USING (true);

-- 3. Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('membership','booking')),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  client_name TEXT,
  phone TEXT,
  appointment_id UUID,
  membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_appt ON public.payments(appointment_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- no public policies; only server (service role) accesses payments

-- 4. Add payment_status to appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','cancelled')),
  ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
  ADD COLUMN IF NOT EXISTS is_member BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_applied INTEGER NOT NULL DEFAULT 0;
