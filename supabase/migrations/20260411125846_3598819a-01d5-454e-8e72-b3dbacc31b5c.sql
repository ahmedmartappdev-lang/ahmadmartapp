
-- Create vendor_payment_transactions table
CREATE TABLE public.vendor_payment_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  transaction_id text,
  description text,
  transaction_type text NOT NULL DEFAULT 'credit',
  balance_after numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vendor_payment_transactions ENABLE ROW LEVEL SECURITY;

-- Admins can view all
CREATE POLICY "Admins can view all vendor payment transactions"
ON public.vendor_payment_transactions
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Admins can insert
CREATE POLICY "Admins can insert vendor payment transactions"
ON public.vendor_payment_transactions
FOR INSERT
TO authenticated
WITH CHECK (is_admin(auth.uid()));

-- Vendors can view their own
CREATE POLICY "Vendors can view own payment transactions"
ON public.vendor_payment_transactions
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.vendors
  WHERE vendors.id = vendor_payment_transactions.vendor_id
    AND vendors.user_id = auth.uid()
));

-- Add amount_due to vendors
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS amount_due numeric NOT NULL DEFAULT 0;
