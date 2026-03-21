ALTER TABLE public.pineyweb_prospects
ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ;
