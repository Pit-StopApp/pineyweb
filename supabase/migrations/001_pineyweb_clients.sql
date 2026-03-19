CREATE TABLE pineyweb_clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  business_name TEXT,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
