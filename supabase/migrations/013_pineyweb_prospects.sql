CREATE TABLE IF NOT EXISTS public.pineyweb_prospects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id TEXT UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  rating NUMERIC,
  review_count INTEGER,
  priority_tier INTEGER DEFAULT 2,
  outreach_status TEXT NOT NULL DEFAULT 'new',
  follow_up_date DATE,
  notes TEXT,
  contact_method TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pineyweb_prospects_status_check
    CHECK (outreach_status IN ('new', 'contacted', 'follow_up', 'closed_won', 'closed_lost'))
);

ALTER TABLE public.pineyweb_prospects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role has full access to prospects"
ON public.pineyweb_prospects FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Admin users can read all prospects"
ON public.pineyweb_prospects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pineyweb_clients
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admin users can write all prospects"
ON public.pineyweb_prospects FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pineyweb_clients
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
