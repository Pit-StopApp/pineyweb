ALTER TABLE pineyweb_clients ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client';
UPDATE pineyweb_clients SET role = 'admin' WHERE user_id = '0ce7aa11-5bc7-49b1-932b-5e0d32081393';

ALTER TABLE pineyweb_orders ADD COLUMN IF NOT EXISTS addons TEXT[];
ALTER TABLE pineyweb_orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE pineyweb_orders ADD COLUMN IF NOT EXISTS email TEXT;
