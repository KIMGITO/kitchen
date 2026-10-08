'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { friendlyError } from '@/lib/errors';

const safeNext = (n?: string) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/dashboard');

export function StaffLoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setBusy(true);
    const f = new FormData(e.currentTarget);
    const { error: err } = await createClient().auth.signInWithPassword({ email: String(f.get('email')), password: String(f.get('password')) });
    if (err) { setBusy(false); setError('Email or password is incorrect.'); return; }
    router.replace(safeNext(next)); router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input label="Password" name="password" type="password" required autoComplete="current-password" />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy}>Log in</Button>
    </form>
  );
}

/** Accepts a staff invitation. Works for new users (sign up) and existing users (log in). */
export function InviteAccept({ token, tenantName, signedInEmail }: { token: string; tenantName: string; signedInEmail: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('signup');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept() {
    const { error: err } = await createClient().rpc('accept_invitation', { p_token: token });
    if (err) { setError(friendlyError(err.message)); setBusy(false); return; }
    router.replace('/dashboard'); router.refresh();
  }
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setBusy(true);
    const f = new FormData(e.currentTarget); const supabase = createClient();
    const email = String(f.get('email')); const password = String(f.get('password'));
    if (mode === 'signup') {
      const { data, error: sErr } = await supabase.auth.signUp({ email, password, options: { data: { full_name: String(f.get('name') ?? '') } } });
      if (sErr) { setBusy(false); setError(sErr.message); return; }
      if (!data.session) { setBusy(false); setNotice('Confirm your email address, then open this invitation link again to join.'); return; }
    } else {
      const { error: lErr } = await supabase.auth.signInWithPassword({ email, password });
      if (lErr) { setBusy(false); setError('Email or password is incorrect.'); return; }
    }
    await accept();
  }

  if (signedInEmail) {
    return (<div className="flex flex-col gap-4">
      <p>You are signed in as <strong>{signedInEmail}</strong>.</p>
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button loading={busy} onClick={() => { setBusy(true); void accept(); }}>Join {tenantName}</Button></div>);
  }
  if (notice) return <p role="status">{notice}</p>;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === 'signup' ? <Input label="Full name" name="name" required minLength={2} /> : null}
      <Input label="Email (use the address you were invited with)" name="email" type="email" required />
      <Input label="Password" name="password" type="password" required minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy}>{mode === 'signup' ? 'Create account and join' : 'Log in and join'}</Button>
      <button type="button" className="text-left text-caption underline" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        {mode === 'signup' ? 'I already have an account' : 'I need to create an account'}
      </button>
    </form>
  );
}
