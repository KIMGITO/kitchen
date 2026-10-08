'use client';
import { useActionState, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { claimPlatformOwnership } from '@/lib/actions/platform';

/**
 * First-run setup: create (or sign in to) the first account, then claim
 * platform ownership. The server action refuses once any platform staff
 * exists, so this page is effectively one-shot.
 */
export function PlatformSetup({ signedInEmail, adminLoginUrl }: { signedInEmail: string | null; adminLoginUrl: string }) {
  const [email, setEmail] = useState(signedInEmail);
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, action, pending] = useActionState(claimPlatformOwnership, null);

  async function onAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setAuthError(null); setBusy(true);
    const f = new FormData(e.currentTarget); const supabase = createClient();
    const em = String(f.get('email')); const pw = String(f.get('password'));
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email: em, password: pw, options: { data: { full_name: String(f.get('name') ?? '') } } });
      if (error) setAuthError(error.message);
      else if (!data.session) setNotice('Confirm your email address, then come back and log in to claim ownership.');
      else setEmail(em);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      if (error) setAuthError('Email or password is incorrect.'); else setEmail(em);
    }
    setBusy(false);
  }

  if (state?.ok) {
    const adminHost = adminLoginUrl.replace(/^https?:\/\//, '');
    return (
      <div className="flex flex-col gap-3" role="status">
        <h2 className="text-h2">You are the platform owner</h2>
        <p>You can now approve or block kitchens, manage plans, commissions and payouts, and invite other platform staff.</p>
        <p>Open the admin console and sign in with the same email: <a className="underline" href={adminLoginUrl}>{adminHost}</a></p>
        <p className="text-caption text-ink-soft">This setup page is now closed permanently.</p>
      </div>
    );
  }
  if (!email) {
    if (notice) return <p role="status">{notice}</p>;
    return (
      <form onSubmit={onAuth} className="flex flex-col gap-4">
        {mode === 'signup' ? <Input label="Your name" name="name" required minLength={2} /> : null}
        <Input label="Email" name="email" type="email" required />
        <Input label="Password" name="password" type="password" required minLength={8} />
        {authError ? <p role="alert" className="text-caption text-danger">{authError}</p> : null}
        <Button type="submit" loading={busy}>{mode === 'signup' ? 'Create account' : 'Log in'}</Button>
        <button type="button" className="text-left text-caption underline" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>{mode === 'signup' ? 'I already have an account' : 'I need to create an account'}</button>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-caption text-ink-soft">Signed in as {email}</p>
      <p className="text-body text-ink-soft">This makes your account the <strong>owner of the whole platform</strong>: approve or block kitchens, set plans and commissions, and control payouts. It only works while no owner exists yet — after that the setup page closes forever.</p>
      {state && !state.ok ? <p role="alert" className="text-caption text-danger">{state.error}</p> : null}
      <Button type="submit" loading={pending}>Make me the platform owner</Button>
    </form>
  );
}
