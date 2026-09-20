-- First, drop the foreign key constraint from delivery_partners.user_id (if it exists)
-- and make user_id nullable so we can insert delivery partners before they sign up
ALTER TABLE delivery_partners 
  ALTER COLUMN user_id DROP NOT NULL;

-- Drop the foreign key constraint on delivery_partners.user_id if it exists
ALTER TABLE delivery_partners DROP CONSTRAINT IF EXISTS delivery_partners_user_id_fkey;

-- Do the same for vendors
ALTER TABLE vendors 
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_user_id_fkey;