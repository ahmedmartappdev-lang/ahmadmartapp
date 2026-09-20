-- The delivery partner profile settings form has Bank Account Number and
-- IFSC Code fields, but the delivery_partners table only had bank_name and
-- account_holder_name — so those two values were being silently dropped on
-- save. Add the missing columns so payout bank details actually persist.
-- (vendors already has both of these columns.)

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS ifsc_code TEXT;
