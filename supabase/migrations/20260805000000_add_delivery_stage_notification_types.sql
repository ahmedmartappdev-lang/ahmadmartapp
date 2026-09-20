-- Two new notification event types for the delivery stages that were
-- previously lumped into order_dispatched. Kept in their own migration
-- because Postgres forbids USING a new enum value in the same transaction
-- that adds it — the follow-up migration (split_dispatch_notifications)
-- references these.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_assigned';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'order_picked_up';
