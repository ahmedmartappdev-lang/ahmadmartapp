
-- Create transaction type enum (already exists, skip if so)
-- The transaction_type enum already exists: 'credit', 'debit', 'refund', 'penalty'

-- Credit transactions ledger for delivery partner wallet
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_partner_id uuid NOT NULL REFERENCES public.delivery_partners(id),
  order_id uuid REFERENCES public.orders(id),
  transaction_type public.transaction_type NOT NULL,
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  description text,
  created_by uuid, -- admin who created the transaction
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Delivery partners can view their own transactions
CREATE POLICY "Delivery partners can view own transactions"
  ON public.credit_transactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_partners
      WHERE delivery_partners.id = credit_transactions.delivery_partner_id
        AND delivery_partners.user_id = auth.uid()
    )
  );

-- Admins can view all transactions
CREATE POLICY "Admins can view all transactions"
  ON public.credit_transactions FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Admins can insert transactions (allocate credits, deductions)
CREATE POLICY "Admins can insert transactions"
  ON public.credit_transactions FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

-- Add credit_balance column to delivery_partners
ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS credit_balance numeric NOT NULL DEFAULT 0;
