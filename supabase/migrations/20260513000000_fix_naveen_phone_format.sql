-- Fix Naveen's phone format on the manually-inserted vendor + delivery_partner
-- rows. They went in as '9952488233' (raw 10 digits) but the send-otp edge
-- function looks up by '+919952488233' so login was failing with "not
-- registered as Delivery Partner". Idempotent — re-running is a no-op if
-- the phone is already in the +91 form.

UPDATE public.delivery_partners
SET phone = '+919952488233'
WHERE email = 'nnahmed.1982@gmail.com'
  AND phone <> '+919952488233';

UPDATE public.vendors
SET phone = '+919952488233'
WHERE email = 'nnahmed.1982@gmail.com'
  AND phone <> '+919952488233';
