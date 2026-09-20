-- Migration: Customer Credit System + Product Admin Pricing
-- Phase 0: Database changes for customer credits and admin pricing

-- 1. Add credit_balance to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS credit_balance numeric DEFAULT 0;

-- 2. Create customer_credit_transactions table
CREATE TABLE IF NOT EXISTS customer_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id),
  amount numeric NOT NULL,
  balance_after numeric NOT NULL DEFAULT 0,
  transaction_type text NOT NULL CHECK (transaction_type IN ('credit', 'debit', 'refund')),
  description text,
  order_id uuid REFERENCES orders(id),
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- RLS for customer_credit_transactions
ALTER TABLE customer_credit_transactions ENABLE ROW LEVEL SECURITY;

-- Customers can read their own transactions
CREATE POLICY "Customers read own credit transactions"
  ON customer_credit_transactions FOR SELECT
  USING (customer_id = auth.uid());

-- Admins can read all
CREATE POLICY "Admins read all credit transactions"
  ON customer_credit_transactions FOR SELECT
  USING (is_admin(auth.uid()));

-- Admins can insert
CREATE POLICY "Admins insert credit transactions"
  ON customer_credit_transactions FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- 3. Insert app_settings for customer credits
INSERT INTO app_settings (key, value, description)
VALUES
  ('default_customer_credit', '0', 'Default credit balance for new customers'),
  ('max_customer_credit', '1000', 'Maximum credit balance allowed per customer')
ON CONFLICT (key) DO NOTHING;

-- 4. Add admin_selling_price and price_status to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_selling_price numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_status text DEFAULT 'approved';
