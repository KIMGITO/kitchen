'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface Props { tenantId: string; tenantName: string; next?: string }

/** Only same-site relative paths are allowed as post-login targets. */
function safeNext(next?: string) { return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'; }

async function ensureCustomer(tenantId: string) {
  const supabase = createClient();
  const { data } = await supabase.from('kitchen_customers').select('id').eq('tenant_id', tenantId).maybeSingle();
  return !!data;
}

export function LoginForm({ tenantId, tenantName, next }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsAccount, setNeedsAccount] = useState(false);
  const [name, setName] = useState('');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setBusy(true);
    const f = new FormData(e.currentTarget);
    const supabase = createClient();
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: String(f.get('email')), password: String(f.get('password')) });
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
        <Button type="submit" loading={busy}>Create account with {tenantName}</Button>
      </form>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input label="Password" name="password" type="password" required autoComplete="current-password" />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy}>Log in</Button>
      <p className="text-caption text-ink-soft">New to {tenantName}? <Link href="/register" className="underline">Create an account</Link></p>
    </form>
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
    const email = String(f.get('email')); const password = String(f.get('password'));
    const fullName = String(f.get('name')); const phone = String(f.get('phone') ?? '');
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
    const { error: rpcErr } = await supabase.rpc('register_kitchen_customer', { p_tenant: tenantId, p_full_name: fullName, p_phone: phone || null });
    setBusy(false);
    if (rpcErr) { setError('We could not create your account. Try again.'); return; }
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/'); router.refresh();
  }

  if (notice) return <p role="status" className="text-body">{notice}</p>;
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="Full name" name="name" required minLength={2} autoComplete="name" />
      <Input label="Phone" name="phone" type="tel" autoComplete="tel" hint="Used for order updates and M-Pesa." />
      <Input label="Email" name="email" type="email" required autoComplete="email" />
      <Input label="Password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy}>Create account with {tenantName}</Button>
      <p className="text-caption text-ink-soft">Already have an account? <Link href="/login" className="underline">Log in</Link></p>
    </form>
  );
}
