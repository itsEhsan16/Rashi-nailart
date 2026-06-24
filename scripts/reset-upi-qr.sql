-- Reset the UPI QR image used on the customer payment screen.
-- Run in the Supabase SQL Editor for project wvosbrierwuwjgiplksz.
--
-- Option A (recommended): point the stored setting at the new QR asset.
update public.app_settings
set upi_qr_url = '/QR.png',
    updated_at  = now()
where id = 'default';

-- Option B: clear it and let the app fallback resolve to /QR.png.
-- update public.app_settings
-- set upi_qr_url = '',
--     updated_at  = now()
-- where id = 'default';

-- Optional: also set the UPI ID so the copy field matches the QR.
-- update public.app_settings
-- set upi_id     = 'jagrutimehta1984-1@okicici',
--     updated_at  = now()
-- where id = 'default';
