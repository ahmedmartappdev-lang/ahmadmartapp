-- Add delivery partners (user_id is now nullable, will be linked on first login)
INSERT INTO delivery_partners (email, full_name, phone, status, vehicle_type)
VALUES 
  ('singhrittika231@gmail.com', 'Rittika Singh', '9999999001', 'available', 'bike'),
  ('mtejash07@gmail.com', 'Tejash M', '9999999002', 'available', 'bike');

-- Add new vendor
INSERT INTO vendors (email, business_name, owner_name, status)
VALUES 
  ('mishratejash505@gmail.com', 'Tejash Store', 'Tejash Mishra', 'active');

-- Fix existing Ahmed Mart vendor with missing email
UPDATE vendors 
SET email = 'ahmedmart.appdev@gmail.com', owner_name = 'Ahmed'
WHERE id = '22222222-2222-2222-2222-222222222001';