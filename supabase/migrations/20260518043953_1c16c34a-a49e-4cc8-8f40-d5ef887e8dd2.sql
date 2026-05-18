ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS completed_at timestamptz;