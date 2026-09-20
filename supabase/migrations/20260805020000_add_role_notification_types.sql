-- Role-specific notification event types for vendors and delivery agents.
-- Separate file: Postgres forbids USING a new enum value in the same
-- transaction that adds it; 20260805030000 references these.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'vendor_new_order';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'vendor_order_cancelled';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'agent_order_assigned';
