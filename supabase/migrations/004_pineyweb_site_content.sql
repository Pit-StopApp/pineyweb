CREATE TABLE pineyweb_site_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES pineyweb_clients(id),
  content_type TEXT NOT NULL,
  content_key TEXT NOT NULL,
  content_value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
