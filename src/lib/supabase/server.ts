import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';

/**
 * Server client bound to the request's cookies. Cookies are HOST-ONLY (no `domain` option),
 * so a session on kitchen-a.example.com is never sent to kitchen-b.example.com.
 */
export async function createClient() {
  const store = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, { ...options, domain: undefined }));
        } catch {
          /* called from a Server Component; middleware refreshes the session instead */
        }
      },
    },
  });
}
