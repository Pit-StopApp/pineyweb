-- Temporarily drop FK on clients so we can import without auth.users
ALTER TABLE pineyweb_clients DROP CONSTRAINT IF EXISTS pineyweb_clients_user_id_fkey;

-- Relax the outreach_status check to include 'lost'
ALTER TABLE pineyweb_prospects DROP CONSTRAINT IF EXISTS pineyweb_prospects_status_check;
ALTER TABLE pineyweb_prospects ADD CONSTRAINT pineyweb_prospects_status_check
  CHECK (outreach_status IN ('new', 'contacted', 'follow_up', 'closed_won', 'closed_lost', 'lost'));

-- Add facebook_url column if missing
ALTER TABLE pineyweb_prospects ADD COLUMN IF NOT EXISTS facebook_url TEXT;
