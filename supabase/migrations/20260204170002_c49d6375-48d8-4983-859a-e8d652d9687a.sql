-- Link the existing admin user_id to the admins table
UPDATE admins 
SET user_id = '90623e07-79c1-49ec-9f83-2776abe3b072' 
WHERE email = 'ahmedmart.appdev@gmail.com' 
AND user_id IS NULL;