ALTER TABLE pineyweb_clients
ADD COLUMN IF NOT EXISTS notification_project_updates BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_billing BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS notification_announcements BOOLEAN NOT NULL DEFAULT true;
