-- Enable RLS on pineyweb_scanner_clients and add access policies
ALTER TABLE pineyweb_scanner_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to scanner_clients"
ON pineyweb_scanner_clients FOR ALL TO service_role USING (true);

CREATE POLICY "Authenticated users can read scanner_clients"
ON pineyweb_scanner_clients FOR ALL TO authenticated USING (true);
