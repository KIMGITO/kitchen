import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { PlatformSetup } from '@/components/admin/PlatformSetup';

export const metadata = { title: 'Platform setup', robots: { index: false, follow: false } };

const MIGRATION_HINT = 'The database is missing migration 017_platform_setup.sql. Run supabase db push (or paste the file into the Supabase SQL Editor) and reload this page.';

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

  return (
    <Section>
      <div className="mx-auto max-w-md">
        <h1 className="text-h1">Platform setup</h1>
        {done ? (
          <div className="mt-4 flex flex-col gap-3">
            <p>Setup is already completed — the platform has an owner.</p>
            <p>Sign in at the <a className="underline" href={adminLoginUrl}>admin console</a>.</p>
          </div>
        ) : ready ? (
          <>
            <p className="mt-4 text-body text-ink-soft">
              Create the first account, then make it the owner of the platform — the owner is who approves or blocks kitchens.
              This page only works while the platform has no owner; after that it closes forever.
            </p>
            <div className="mt-6"><PlatformSetup signedInEmail={email} adminLoginUrl={adminLoginUrl} /></div>
          </>
        ) : (
          <p role="alert" className="mt-4 text-body text-danger">{MIGRATION_HINT}</p>
        )}
      </div>
    </Section>
  );
}
