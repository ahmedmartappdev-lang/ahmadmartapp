-- The Record Payment dialog now offers an optional "Collected by
-- Delivery Agent" picker. When set, it inserts a credit_cash_collections
-- row server-side as the admin. The existing INSERT policy only allows
-- delivery partners to insert THEIR OWN rows; admin inserts were getting
-- "new row violates row-level security policy".
--
-- Add a matching admin INSERT policy. Same auth gate the other admin
-- policies on this table use (is_admin(auth.uid())).
-- Idempotent.

DROP POLICY IF EXISTS "Admins can insert collections" ON public.credit_cash_collections;
CREATE POLICY "Admins can insert collections"
  ON public.credit_cash_collections
  FOR INSERT
  WITH CHECK (is_admin(auth.uid()));
