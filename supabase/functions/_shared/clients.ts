import { createClient } from 'npm:@supabase/supabase-js@2';

const url = () => Deno.env.get('SUPABASE_URL')!;

/** Service-role client: bypasses RLS. Only used after the caller has been authenticated/verified. */
export const serviceClient = () =>
  createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });

/** Client acting AS the caller (their JWT), so RLS decides what they can see. */
export const userClient = (authHeader: string) =>
  createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false },
  });

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

/** Browsers call this function from kitchen subdomains and custom domains. The JWT, not the origin, is the credential. */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
