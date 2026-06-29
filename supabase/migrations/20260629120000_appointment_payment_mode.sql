-- How the in-store balance (service price + extras) was settled.
-- The ₹50 booking fee is always paid online via UPI; the rest is paid at the
-- salon as either UPI or Cash. null = not yet recorded by staff/manager.
alter table public.appointments
  add column if not exists payment_mode text
    check (payment_mode is null or payment_mode in ('upi','cash'));

comment on column public.appointments.payment_mode is
  'How the in-store balance (service price + extras) was settled: upi | cash | null (unrecorded).';
