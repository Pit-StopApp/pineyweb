CREATE TABLE pineyweb_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  confirmation_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id),
  tier TEXT DEFAULT 'Managed',
  site_url TEXT,
  business_name TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
