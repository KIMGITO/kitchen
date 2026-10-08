import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';

/** Refreshes the Supabase session cookie (host-only) and returns the response to continue with. */
export async function refreshSession(request: NextRequest, response: NextResponse) {
  // Anonymous visitors (most storefront traffic) have no session to refresh: skip the Auth-server round trip.
  if (!request.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return response;
  const supabase = createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        list.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, { ...options, domain: undefined });
        });
      },
    },
  });
  await supabase.auth.getUser(); // validates with the Auth server and rotates tokens when needed
  return response;
}
