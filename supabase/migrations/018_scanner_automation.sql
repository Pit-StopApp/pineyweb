CREATE TABLE IF NOT EXISTS public.pineyweb_scanner_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city TEXT NOT NULL,
  state TEXT DEFAULT 'TX',
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  distance_from_longview_miles NUMERIC NOT NULL,
  population INTEGER,
  last_scanned_at TIMESTAMPTZ,
  prospects_found INTEGER DEFAULT 0,
  emails_found INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT scanner_queue_status_check
    CHECK (status IN ('pending', 'scanning', 'complete', 'error'))
);

CREATE TABLE IF NOT EXISTS public.pineyweb_daily_send_tracker (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  emails_sent INTEGER DEFAULT 0,
  daily_cap INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.pineyweb_scanner_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pineyweb_daily_send_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to scanner_queue"
ON public.pineyweb_scanner_queue FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access to daily_send_tracker"
ON public.pineyweb_daily_send_tracker FOR ALL TO service_role USING (true);
