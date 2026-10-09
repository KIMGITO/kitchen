'use client';
import { useActionState, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { registerKitchen } from '@/lib/actions/platform';
import { LinkIcon } from '@phosphor-icons/react';

export function StartKitchen({
  rootDomain,
  signedInEmail,
}: {
  rootDomain: string;
  signedInEmail: string | null;
}) {
  const [email, setEmail] = useState(signedInEmail);
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [state, action, pending] = useActionState(registerKitchen, null);

  async function onAuth(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAuthError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const supabase = createClient();
    const em = String(f.get('email'));
    const pw = String(f.get('password'));
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email: em,
        password: pw,
        options: { data: { full_name: String(f.get('name') ?? '') } },
      });
      if (error) setAuthError(error.message);
      else if (!data.session)
        setNotice(
          'Confirm your email address, then come back and log in to create your kitchen.',
        );
      else setEmail(em);
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: em,
        password: pw,
      });
      if (error) setAuthError('Email or password is incorrect.');
      else setEmail(em);
    }
    setBusy(false);
  }

  if (state?.ok && state.data) {
    return (
      <div className="flex flex-col text-start gap-3" role="status">
        <h2 className="text-h2">Your kitchen is created</h2>
        <p>
          Address:{' '}
          <strong>
            {state.data.slug}.{rootDomain}
          </strong>
        </p>
        <p>
          It is waiting for approval. You can sign in at{' '}
          <strong>
            {state.data.slug}.{rootDomain}/staff-login
          </strong>{' '}
          now to build your menu and settings; customers will see the storefront
          once the platform team approves it.
        </p>
        <p className="text-caption text-ink-soft">
          Sign-in is separate on each address, so log in again there with the
          same email and password.
        </p>
      </div>
    );
  }
  if (!email) {
    if (notice) return <p role="status">{notice}</p>;
    return (
      <form onSubmit={onAuth} className="flex flex-col gap-4">
        {mode === 'signup' ? (
          <Input label="Your name" name="name" required minLength={2} />
        ) : null}
        <Input label="Email" name="email" type="email" required />
        <Input
          label="Password"
          k
          name="password"
          type="password"
          required
          minLength={8}
        />
        {authError ? (
          <p role="alert" className="text-caption text-danger">
            {authError}
          </p>
        ) : null}
        <Button type="submit" loading={busy} loadingText={mode === 'signup' ? 'Creating account…' : 'Logging in…'} autoLoading={false}>
          {mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
        <button
          type="button"
          className="text-left text-caption underline"
          onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
        >
          {mode === 'signup'
            ? 'I already have an account'
            : 'I need to create an account'}
        </button>
      </form>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <p className="text-caption text-ink-soft">Signed in as {email}</p>
      <Input
        label="Kitchen name"
        name="name"
        required
        minLength={2}
        maxLength={80}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Input
            variant="flush"
            icon={<LinkIcon className="size-5" />}
            iconPosition="left"
            label="Web address"
            placeholder="my-kitchen"
            type="text"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            id="slug"
            name="slug"
            required
            pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]"
            minLength={3}
            maxLength={40}
            className="h-11 flex-1 rounded-md border border-line px-3"
            helperText="Lowercase letters, numbers and hyphens."
          />
          <span className="text-body text-ink-soft self-end">
            .{rootDomain}
          </span>
        </div>
        <p className="text-caption text-ink-soft">
          Lowercase letters, numbers and hyphens.
        </p>
      </div>
      {state && !state.ok ? (
        <p role="alert" className="text-caption text-danger">
          {state.error}
        </p>
      ) : null}
      <Button variant='primary' type="submit" loading={pending} loadingText="Creating kitchen…">
        Create kitchen
      </Button>
    </form>
  );
}
