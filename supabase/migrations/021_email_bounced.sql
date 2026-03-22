-- Add email_bounced column to pineyweb_prospects
ALTER TABLE pineyweb_prospects
  ADD COLUMN IF NOT EXISTS email_bounced boolean DEFAULT false;
