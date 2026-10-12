import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { PlatformSetup } from '@/components/admin/PlatformSetup';
import { describeError } from '@/lib/errors';
import Link from 'next/link';

export const metadata = { title: 'Platform setup', robots: { index: false, follow: false } };


/**
 * First-run setup on the root host: create the first account and make it the
 * platform owner. Read-only once platform_staff has any row.
 */
export default async function Setup() {
  const supabase = await createClient();
  const [{ data: required, error }, { data: auth }, h] = await Promise.all([
    supabase.rpc('platform_setup_required'),
    supabase.auth.getUser(),
    headers(),
  ]);
  const host = h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const adminLoginUrl = `${proto}://admin.${host}/login`;
  const email = auth.user?.email ?? null;

  const done = !error && required === false;
  const ready = !error && required === true;
  const reason = error ? describeError(error.message, 'Platform setup failed.') : 'Platform setup is not required.';

  return (
    <Section>
      <div className="mx-auto max-w-md  text-start">
        <h1 className="text-h1">Platform setup</h1>
        {done ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className='text-accent bg-brand p-1.5 leading-loose text-center rounded'>Setup is already completed.</p>
            <p className='mt-6 text-right'>Sign in at the <Link className="underline font-semibold text-brand" href={adminLoginUrl}>Admin console</Link>.</p>
          </div>
        ) : ready ? (
          <>
            <p className="mt-4 text-body text-ink-soft">
              Setup platform admin account. This page will display only now.
            </p>
            <div className="mt-6"><PlatformSetup signedInEmail={email} adminLoginUrl={adminLoginUrl} /></div>
          </>
        ) : (
          <div role="alert" className="mt-4 flex flex-col gap-2 text-body text-danger">
            <p>{reason}</p>
            {error ? <pre className="whitespace-pre-wrap break-words rounded-md border border-danger/30 bg-danger/5 p-3 text-caption text-ink-soft">{error.message}</pre> : null}
          </div>
        )}
      </div>
    </Section>
  );
}
