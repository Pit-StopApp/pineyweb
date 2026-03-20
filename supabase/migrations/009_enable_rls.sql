-- Enable RLS
ALTER TABLE public.pineyweb_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pineyweb_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pineyweb_site_content ENABLE ROW LEVEL SECURITY;

-- pineyweb_clients policies
CREATE POLICY "Users can read own client record"
ON public.pineyweb_clients FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own client record"
ON public.pineyweb_clients FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to clients"
ON public.pineyweb_clients FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- pineyweb_orders policies
CREATE POLICY "Users can read own orders"
ON public.pineyweb_orders FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to orders"
ON public.pineyweb_orders FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- pineyweb_site_content policies
CREATE POLICY "Users can read own site content"
ON public.pineyweb_site_content FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.pineyweb_clients
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can write own site content"
ON public.pineyweb_site_content FOR ALL
USING (
  client_id IN (
    SELECT id FROM public.pineyweb_clients
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Service role has full access to site content"
ON public.pineyweb_site_content FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
