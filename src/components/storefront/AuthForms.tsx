'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { GoogleButton, OrDivider } from './GoogleButton';
import { checkPassword, PASSWORD_HINT } from '@/lib/auth/password';
import { normalizeKePhone, PHONE_ERROR } from '@/lib/phone';

interface Props { tenantId: string; tenantName: string; next?: string; notice?: string }

export const AUTH_NOTICES: Record<string, string> = {
  staff_account: 'That Google account belongs to a kitchen or platform team member. Team members sign in with their email and password at /staff-login.',
  oauth_failed: 'Google sign-in did not complete. Please try again.',
  register_failed: 'We signed you in but could not create your customer account. Try again.',
};

/** Only same-site relative paths are allowed as post-login targets. */
function safeNext(next?: string) { return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'; }

async function ensureCustomer(tenantId: string) {
  const supabase = createClient();
  const { data } = await supabase.from('kitchen_customers').select('id').eq('tenant_id', tenantId).maybeSingle();
  return !!data;
}

export function LoginForm({ tenantId, tenantName, next, notice }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [name, setName] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setBusy(true);
    const f = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: String(f.get('email')).trim().toLowerCase(), password: String(f.get('password')) });
    if (authErr) { setBusy(false); setError('Email or password is incorrect.'); return; }
    if (await ensureCustomer(tenantId)) { router.replace(safeNext(next)); router.refresh(); return; }
    setBusy(false); setNeedsAccount(true);
  }

  async function createAccount(e: FormEvent) {
    e.preventDefault(); setError(null); setBusy(true);
    const { error: rpcErr } = await createClient().rpc('register_kitchen_customer', { p_tenant: tenantId, p_full_name: name });
    setBusy(false);
    if (rpcErr) { setError('We could not create your account. Try again.'); return; }
    router.replace(safeNext(next)); router.refresh();
  }

  if (needsAccount) {
    return (
      <form onSubmit={createAccount} className="flex flex-col gap-4">
        <p role="status" className="text-body">You don&apos;t have a customer account with {tenantName} yet.</p>
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" />
        {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
        <Button type="submit" loading={busy} loadingText="Creating account…" autoLoading={false}>Create account with {tenantName}</Button>
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-4">
    {notice && AUTH_NOTICES[notice] ? <p role="alert" className="rounded-md border border-accent/60 bg-accent-soft p-3 text-caption text-ink">{AUTH_NOTICES[notice]}</p> : null}
    <GoogleButton next={next} />
    <OrDivider />
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input label="Password" name="password" type="password" required autoComplete="current-password" />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy} loadingText="Logging in…" autoLoading={false}>Log in</Button>
      <p className="text-caption text-ink-soft">New to {tenantName}? <Link href="/register" className="underline">Create an account</Link></p>
    </form>
    </div>
  );
}

export function RegisterForm({ tenantId, tenantName, next }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setBusy(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get('email')).trim().toLowerCase(); const password = String(f.get('password'));
    const fullName = String(f.get('name')).trim(); const phone = normalizeKePhone(String(f.get('phone') ?? ''));
    if (!phone) { setBusy(false); setError(PHONE_ERROR); return; }
    const pwError = checkPassword(password, String(f.get('confirm') ?? ''), email);
    if (pwError) { setBusy(false); setError(pwError); return; }
    const supabase = createClient();

    let { data: session } = await supabase.auth.getSession();
    if (!session.session) {
      const { data, error: signErr } = await supabase.auth.signUp({
        email, password, options: { data: { full_name: fullName, phone }, emailRedirectTo: `${location.origin}/auth/callback?next=/login` },
      });
      if (signErr) { setBusy(false); setError(signErr.message); return; }
      if (!data.session) { setBusy(false); setNotice('Check your email to confirm your address, then log in to finish creating your account.'); return; }
      session = { session: data.session };
    }
    const { error: rpcErr } = await supabase.rpc('register_kitchen_customer', { p_tenant: tenantId, p_full_name: fullName, p_phone: phone });
    setBusy(false);
    if (rpcErr) { setError('We could not create your account. Try again.'); return; }
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/'); router.refresh();
  }

  if (notice) return <p role="status" className="text-body">{notice}</p>;
  return (
    <div className="flex flex-col gap-4">
    <GoogleButton next={next} label="Sign up with Google" />
    <OrDivider />
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="Full name" name="name" required minLength={2} autoComplete="name" />
      <PhoneInput label="Mobile number" name="phone" required hint="Used for your receipt, order updates and M-Pesa." />
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input label="Password" name="password" type="password" required minLength={8} autoComplete="new-password" hint={PASSWORD_HINT} />
      <Input label="Confirm password" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy} loadingText="Creating account…" autoLoading={false}>Create account with {tenantName}</Button>
      <p className="text-caption text-ink-soft">Already have an account? <Link href="/login" className="underline">Log in</Link></p>
    </form>
    </div>
  );
}
