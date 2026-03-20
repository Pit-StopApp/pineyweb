-- Allow authenticated users to insert their own client record (signup)
CREATE POLICY "Users can insert own client record"
ON public.pineyweb_clients FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow admin users to read all client records
CREATE POLICY "Admin users can read all clients"
ON public.pineyweb_clients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.pineyweb_clients
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Allow admin users to update all client records
CREATE POLICY "Admin users can update all clients"
ON public.pineyweb_clients FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.pineyweb_clients
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);
