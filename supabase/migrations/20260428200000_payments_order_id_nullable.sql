-- Credit-dues repayments are orderless (no order_id). Allow payments.order_id NULL
-- so record_credit_payment can audit-log them. Order-payment flow still passes a
-- non-null order_id so existing data is unaffected.
ALTER TABLE public.payments
  ALTER COLUMN order_id DROP NOT NULL;
