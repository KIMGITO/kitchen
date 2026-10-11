'use client';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { checkPassword, PASSWORD_HINT } from '@/lib/auth/password';
import { buildResetRedirect, safePath } from '@/lib/auth/reset';

/**
 * Step 1 — request a recovery email.
 * `returnTo` is the page the user should land on after choosing a new password
 * (e.g. `/login`, `/staff-login` or `/platform-admin/login`).
 *
 * We always show the same confirmation whether or not the address exists, so the
 * form can't be used to discover which emails have accounts.
 */
export function ForgotPasswordForm({ returnTo = '/login' }: { returnTo?: string }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const email = String(new FormData(e.currentTarget).get('email') ?? '').trim().toLowerCase();
    if (!email) {
      setBusy(false);
      setError('Enter your email address.');
      return;
    }
    const { error: resetErr } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: buildResetRedirect(window.location.origin, returnTo),
    });
    setBusy(false);
    if (resetErr) {
      setError('We could not send the email right now. Please try again in a moment.');
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="text-body">
          If an account exists for that email address, we&apos;ve sent a link to reset the password. Check your inbox and spam folder.
        </p>
        <p className="text-caption text-ink-soft">The link expires in 1 hour and can be used once.</p>
        <p className="text-caption text-ink-soft">
          <Link href={safePath(returnTo, '/login')} className="underline">Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="Email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy} loadingText="Sending link…" autoLoading={false}>Send reset link</Button>
    </form>
  );
}

/**
 * Step 2 — choose a new password. Reached from the recovery email link, which the
 * `/auth/callback` route has already exchanged for a signed-in session. If there is
 * no session (expired/used link, or a direct visit), we point the user back to step 1.
 */
export function ResetPasswordForm({ returnTo = '/login' }: { returnTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null); // null = checking, false = no session

  useEffect(() => {
    let active = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (active) setReady(!!data.user);
      })
      .catch(() => {
        if (active) setReady(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const password = String(f.get('password') ?? '');
    const confirm = String(f.get('confirm') ?? '');
    const pwError = checkPassword(password, confirm);
    if (pwError) {
      setBusy(false);
      setError(pwError);
      return;
    }
    const { error: updateErr } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (updateErr) {
      setError('We could not update your password. The link may have expired — request a new one.');
      return;
    }
    // Sign the recovery session out so the user logs in fresh with the new password,
    // then show a self-contained confirmation that links to the right login page.
    await createClient().auth.signOut();
    setDone(true);
    router.refresh();
  }

  if (done) {
    const dest = safePath(returnTo, '/login');
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="text-body">Your password has been updated. You can now log in with your new password.</p>
        <p className="text-caption text-ink-soft">
          <Link href={dest} className="underline">Go to log in</Link>
        </p>
      </div>
    );
  }

  if (ready === null) {
    return <p role="status" className="text-body text-ink-soft">Checking your reset link…</p>;
  }

  if (ready === false) {
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-body">
          This reset link is invalid or has expired. Request a new one to continue.
        </p>
        <p className="text-caption text-ink-soft">
          <Link href="/forgot-password" className="underline">Request a new link</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="New password" name="password" type="password" required minLength={8} autoComplete="new-password" hint={PASSWORD_HINT} />
      <Input label="Confirm new password" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      {error ? <p role="alert" className="text-caption text-danger">{error}</p> : null}
      <Button type="submit" loading={busy} loadingText="Updating…" autoLoading={false}>Update password</Button>
    </form>
  );
}
