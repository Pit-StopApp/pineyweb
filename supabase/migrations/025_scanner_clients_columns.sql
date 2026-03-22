-- Add missing columns to pineyweb_scanner_clients
ALTER TABLE pineyweb_scanner_clients
ADD COLUMN IF NOT EXISTS client_slug TEXT,
ADD COLUMN IF NOT EXISTS home_lat FLOAT,
ADD COLUMN IF NOT EXISTS home_lng FLOAT,
ADD COLUMN IF NOT EXISTS home_city TEXT,
ADD COLUMN IF NOT EXISTS home_state TEXT,
ADD COLUMN IF NOT EXISTS scan_radius_miles INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS min_review_count INTEGER DEFAULT 5,
ADD COLUMN IF NOT EXISTS require_website BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS require_no_website BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS delivery_mode TEXT DEFAULT 'crm',
ADD COLUMN IF NOT EXISTS email_outreach_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS delivery_email TEXT;

-- Update Sip Society row with correct values
UPDATE pineyweb_scanner_clients SET
  client_slug = 'sip-society',
  home_lat = 32.5007,
  home_lng = -94.7405,
  home_city = 'Longview',
  home_state = 'TX',
  scan_radius_miles = 100,
  min_review_count = 5,
  require_website = true,
  require_no_website = false,
  delivery_mode = 'excel_download',
  email_outreach_enabled = false,
  active = true,
  delivery_email = 'hello@sipsociety.social'
WHERE name = 'Sip Society Mobile Bar';
