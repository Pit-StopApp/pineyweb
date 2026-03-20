ALTER TABLE pineyweb_clients
DROP CONSTRAINT IF EXISTS pineyweb_clients_status_check;

ALTER TABLE pineyweb_clients
ADD CONSTRAINT pineyweb_clients_status_check
CHECK (status IN ('pending', 'active', 'in_progress', 'live', 'suspended'));
