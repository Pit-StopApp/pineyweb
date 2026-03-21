CREATE POLICY "Admin can read scanner_queue"
ON public.pineyweb_scanner_queue FOR ALL
TO authenticated
USING (true);

CREATE POLICY "Admin can read daily_send_tracker"
ON public.pineyweb_daily_send_tracker FOR ALL
TO authenticated
USING (true);
