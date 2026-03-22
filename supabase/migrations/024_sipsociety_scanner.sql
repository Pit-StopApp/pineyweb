-- Sip Society Mobile Bar — scanner tables and config

-- Sip Society prospects table (mirrors pineyweb_prospects + extra columns)
CREATE TABLE IF NOT EXISTS sipsociety_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  email_source TEXT,
  facebook_url TEXT,
  website_url TEXT,
  google_maps_url TEXT,
  google_place_types TEXT[],
  rating NUMERIC,
  review_count INTEGER,
  priority_tier INTEGER DEFAULT 2,
  outreach_status TEXT NOT NULL DEFAULT 'new',
  follow_up_date DATE,
  notes TEXT,
  contact_method TEXT,
  emailed_at TIMESTAMPTZ,
  email_delivered BOOLEAN DEFAULT FALSE,
  email_bounced BOOLEAN DEFAULT FALSE,
  email_spam BOOLEAN DEFAULT FALSE,
  has_mobile_bar_partner BOOLEAN DEFAULT FALSE,
  contacted_by TEXT,
  referral_partnership BOOLEAN DEFAULT FALSE,
  partnership_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sipsociety_prospects_status_check
    CHECK (outreach_status IN ('new', 'contacted', 'follow_up', 'closed_won', 'closed_lost', 'lost'))
);

ALTER TABLE sipsociety_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to sipsociety_prospects"
ON sipsociety_prospects FOR ALL TO service_role USING (true);
CREATE POLICY "Admin can access sipsociety_prospects"
ON sipsociety_prospects FOR ALL TO authenticated USING (true);

-- Sip Society scanner queue
CREATE TABLE IF NOT EXISTS sipsociety_scanner_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'TX',
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  distance_from_center_miles NUMERIC NOT NULL,
  population INTEGER,
  last_scanned_at TIMESTAMPTZ,
  prospects_found INTEGER DEFAULT 0,
  emails_found INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT sipsociety_queue_status_check
    CHECK (status IN ('pending', 'scanning', 'complete', 'error'))
);

ALTER TABLE sipsociety_scanner_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to sipsociety_scanner_queue"
ON sipsociety_scanner_queue FOR ALL TO service_role USING (true);
CREATE POLICY "Admin can access sipsociety_scanner_queue"
ON sipsociety_scanner_queue FOR ALL TO authenticated USING (true);

-- Seed Sip Society scanner client config
INSERT INTO pineyweb_scanner_clients (name, scanner_type, geography, status, keywords, business_types)
VALUES (
  'Sip Society Mobile Bar',
  'event_venue_partners',
  'East Texas (100mi from Longview)',
  'active',
  ARRAY['wedding planner', 'wedding coordinator', 'bridal consultant', 'event coordinator', 'event planner', 'party planner', 'wedding venue', 'event venue', 'reception venue', 'banquet hall', 'event space', 'event center', 'country club', 'golf club event space', 'winery event venue', 'vineyard wedding', 'barn wedding venue', 'ranch wedding venue', 'estate wedding venue', 'bridal shop', 'wedding florist', 'wedding photographer', 'wedding DJ', 'catering company', 'party rental company'],
  ARRAY['lodging', 'event_venue', 'banquet_hall']
);

-- Seed Sip Society queue with East Texas cities
INSERT INTO sipsociety_scanner_queue (city, state, lat, lng, distance_from_center_miles, population) VALUES
  ('Longview', 'TX', 32.5007, -94.7405, 0, 82000),
  ('Kilgore', 'TX', 32.3862, -94.8788, 10, 15000),
  ('Gladewater', 'TX', 32.5365, -94.9427, 13, 6500),
  ('Gilmer', 'TX', 32.7288, -94.9427, 20, 5500),
  ('Marshall', 'TX', 32.5449, -94.3674, 22, 23000),
  ('Henderson', 'TX', 32.1534, -94.7994, 25, 13000),
  ('Jefferson', 'TX', 32.7574, -94.3516, 30, 2100),
  ('Pittsburg', 'TX', 32.9954, -94.9658, 35, 4800),
  ('Tyler', 'TX', 32.3513, -95.3011, 38, 107000),
  ('Whitehouse', 'TX', 32.2268, -95.2157, 40, 8500),
  ('Carthage', 'TX', 32.1571, -94.3374, 40, 6800),
  ('Lindale', 'TX', 32.5160, -95.4094, 42, 6300),
  ('Bullard', 'TX', 32.1291, -95.3202, 45, 4200),
  ('Mount Pleasant', 'TX', 33.1568, -94.9685, 48, 16500),
  ('Mineola', 'TX', 32.6632, -95.4882, 50, 4700),
  ('Jacksonville', 'TX', 31.9635, -95.2705, 50, 14500),
  ('Winnsboro', 'TX', 32.9574, -95.2903, 55, 3600),
  ('Rusk', 'TX', 31.7963, -95.1511, 60, 5600),
  ('Shreveport', 'LA', 32.5252, -93.7502, 60, 187000),
  ('Nacogdoches', 'TX', 31.6035, -94.6553, 63, 33000),
  ('Sulphur Springs', 'TX', 33.1385, -95.6011, 65, 16500),
  ('Canton', 'TX', 32.5565, -95.8633, 72, 4000),
  ('Athens', 'TX', 32.2049, -95.8550, 75, 13000),
  ('Palestine', 'TX', 31.7621, -95.6308, 80, 18000),
  ('Texarkana', 'TX', 33.4418, -94.0477, 80, 37000),
  ('Lufkin', 'TX', 31.3382, -94.7291, 82, 36000),
  ('Center', 'TX', 31.7946, -94.1791, 85, 5600)
ON CONFLICT DO NOTHING;
