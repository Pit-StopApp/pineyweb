-- Add columns for Google Custom Search facebook URL discovery
ALTER TABLE pineyweb_prospects
ADD COLUMN IF NOT EXISTS facebook_found boolean,
ADD COLUMN IF NOT EXISTS facebook_match_score numeric,
ADD COLUMN IF NOT EXISTS facebook_search_method text;
-- facebook_url already exists from earlier migrations
