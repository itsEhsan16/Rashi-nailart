
-- Roles enum
CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'staff');
CREATE TYPE public.branch AS ENUM ('Vile Parle', 'Bandra');

-- Simple auth users table (username/password)
CREATE TABLE public.app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role public.user_role NOT NULL,
  branch public.branch,
  staff_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Staff table
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  branch public.branch NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, branch)
);

-- Appointments table
CREATE TABLE public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  branch public.branch NOT NULL,
  appointment_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  service TEXT NOT NULL,
  price INTEGER NOT NULL,
  staff_name TEXT NOT NULL,
  special_requests TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Public can insert appointments (booking form)
CREATE POLICY "Anyone can book an appointment"
ON public.appointments FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Staff list publicly readable (needed for booking form)
CREATE POLICY "Anyone can read staff"
ON public.staff FOR SELECT
TO anon, authenticated
USING (true);

-- All other operations are blocked from client; server functions use service role.
-- (No SELECT policy on app_users or appointments => locked from client.)

-- Seed staff
INSERT INTO public.staff (name, branch) VALUES
('Divya','Vile Parle'),('Bhagya','Vile Parle'),('Ritika','Vile Parle'),
('Shreya','Vile Parle'),('Fiza','Vile Parle'),('Saira','Vile Parle'),
('Tejswini','Vile Parle'),('Kumku','Vile Parle'),('Mansi','Vile Parle'),
('Shilpa','Vile Parle'),('Asmita','Vile Parle'),
('Karishma','Bandra'),('Aarzoo','Bandra'),('Bhawna','Bandra'),
('Jinal','Bandra'),('Hemlata','Bandra'),('Sharvani','Bandra');

-- Seed default users (passwords are sha256 hashes; default password = "password123")
-- sha256('password123') = ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
INSERT INTO public.app_users (username, password_hash, role, branch, staff_name) VALUES
('admin','ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f','admin',NULL,NULL),
('manager','ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f','manager',NULL,NULL),
('divya','ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f','staff','Vile Parle','Divya'),
('karishma','ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f','staff','Bandra','Karishma');
