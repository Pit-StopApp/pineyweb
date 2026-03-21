DROP POLICY IF EXISTS "Users can read own client record" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Users can update own client record" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Authenticated users can read own client record" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Authenticated users can update own client record" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Service role has full access to clients" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Users can insert own client record" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Admin users can read all clients" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Admin users can update all clients" ON public.pineyweb_clients;
DROP POLICY IF EXISTS "Service role full access" ON public.pineyweb_clients;

CREATE POLICY "Users can read own client record"
ON public.pineyweb_clients FOR SELECT
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own client record"
ON public.pineyweb_clients FOR UPDATE
TO authenticated
USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own client record"
ON public.pineyweb_clients FOR INSERT
TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Service role full access"
ON public.pineyweb_clients FOR ALL
TO service_role
USING (true);
