'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Client-side session guard. On mount (and whenever the browser tab regains
 * focus), it validates the session against the Auth server. If the session has
 * expired or been revoked, it forces a clean sign-out and redirects to the
 * relevant login page with `?expired=1`, so the user is never left in a
 * half-authenticated UI state.
 *
 * The server middleware already refreshes/clears cookies; this guard closes the
 * gap where a client component keeps rendering with a stale, already-invalid
 * session (e.g. a tab left open past expiry).
 *
 * @param loginPath where to send the user after a forced logout
 */
export function useSessionGuard(loginPath: string) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function verify() {
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      if (!data.user) {
        await supabase.auth.signOut();
        const sep = loginPath.includes('?') ? '&' : '?';
        router.replace(`${loginPath}${sep}expired=1`);
        router.refresh();
      }
    }

    void verify();
    const onFocus = () => void verify();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [loginPath, router]);
}
