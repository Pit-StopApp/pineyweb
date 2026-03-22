CREATE TABLE IF NOT EXISTS pineyweb_scanner_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES pineyweb_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scanner_type TEXT,
  geography TEXT,
  status TEXT DEFAULT 'active',
  last_run_at TIMESTAMPTZ,
  total_leads INTEGER DEFAULT 0,
  keywords TEXT[],
  business_types TEXT[],
  google_sheet_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
