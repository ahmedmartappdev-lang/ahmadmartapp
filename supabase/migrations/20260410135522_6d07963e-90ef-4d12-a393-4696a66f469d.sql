
CREATE TABLE public.cash_returns (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  delivery_partner_id uuid NOT NULL REFERENCES public.delivery_partners(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending',
  admin_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Delivery partners can insert own cash returns"
ON public.cash_returns FOR INSERT
TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM delivery_partners
  WHERE delivery_partners.id = cash_returns.delivery_partner_id
    AND delivery_partners.user_id = auth.uid()
));

CREATE POLICY "Delivery partners can view own cash returns"
ON public.cash_returns FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM delivery_partners
  WHERE delivery_partners.id = cash_returns.delivery_partner_id
    AND delivery_partners.user_id = auth.uid()
));

CREATE POLICY "Admins can view all cash returns"
ON public.cash_returns FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can update cash returns"
ON public.cash_returns FOR UPDATE
TO authenticated
USING (is_admin(auth.uid()));
