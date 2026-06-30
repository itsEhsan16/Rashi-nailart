-- Break the in-store payment mode out by app: Google Pay, PhonePe, Paytm, or Cash
-- (previously just 'upi' | 'cash'). 'upi' is kept in the allowed set as a legacy
-- value so rows recorded before this split stay valid. null = unrecorded.
alter table public.appointments
  drop constraint if exists appointments_payment_mode_check;

alter table public.appointments
  add constraint appointments_payment_mode_check
    check (payment_mode is null or payment_mode in ('gpay','phonepe','paytm','cash','upi'));

comment on column public.appointments.payment_mode is
  'How the in-store balance (service price + extras) was settled: gpay | phonepe | paytm | cash | upi (legacy) | null (unrecorded).';
