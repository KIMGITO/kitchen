'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Customer-only sign-in. Staff and platform admins are blocked server-side in /auth/callback. */
export function GoogleButton({ next, label = 'Continue with Google' }: { next?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true); setError(null);
    const safe = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?flow=customer&next=${encodeURIComponent(safe)}`, queryParams: { prompt: 'select_account' } },
    });
    if (err) { setBusy(false); setError('Google sign-in is not available right now. Use your email and password instead.'); }
  }
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" size="lg" className="w-full" loading={busy} loadingText="Opening Google…" autoLoading={false} onClick={go}>
        <GoogleG /> {label}
      </Button>
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-caption text-ink-soft" role="separator" aria-label="or">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}
