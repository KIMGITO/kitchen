import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS. Use ONLY in trusted server code
 * (webhooks, system jobs). Never import from client components.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(publicEnv.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
