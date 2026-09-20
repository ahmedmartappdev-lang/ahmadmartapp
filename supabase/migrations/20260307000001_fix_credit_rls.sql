-- Allow customers to insert their own credit transactions (for order credit usage)
CREATE POLICY "Customers insert own credit transactions"
  ON customer_credit_transactions FOR INSERT
  WITH CHECK (customer_id = auth.uid());

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_credit_transactions_customer_id
  ON customer_credit_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at
  ON customer_credit_transactions(created_at DESC);
