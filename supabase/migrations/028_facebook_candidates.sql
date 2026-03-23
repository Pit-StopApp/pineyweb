CREATE TABLE IF NOT EXISTS pineyweb_prospect_facebook_candidates (
  id uuid default gen_random_uuid() primary key,
  prospect_id uuid references pineyweb_prospects(id) on delete cascade,
  facebook_url text not null,
  match_score numeric,
  search_method text,
  rank integer,
  created_at timestamptz default now()
);

ALTER TABLE pineyweb_prospect_facebook_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to facebook_candidates"
ON pineyweb_prospect_facebook_candidates FOR ALL TO service_role USING (true);
CREATE POLICY "Admin can access facebook_candidates"
ON pineyweb_prospect_facebook_candidates FOR ALL TO authenticated USING (true);
