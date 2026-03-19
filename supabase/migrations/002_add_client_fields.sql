-- Add status, site_url, and tier columns to pineyweb_clients
ALTER TABLE pineyweb_clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE pineyweb_clients ADD COLUMN IF NOT EXISTS site_url TEXT;
ALTER TABLE pineyweb_clients ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'Managed';
