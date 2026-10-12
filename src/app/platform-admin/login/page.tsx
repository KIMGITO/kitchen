import { Section } from '@/components/ui/Section';
import { StaffLoginForm } from '@/components/kitchen/StaffAuth';
export const metadata = { title: 'Platform admin login', robots: { index: false, follow: false } };

/**
 * `requirePlatform()` redirects here with `?error=<reason>` when a guard refuses
 * access. Without this the user was bounced to a blank login form with no
 * indication that their sign-in had actually worked.
 */
const GUARD_MESSAGES: Record<string, string> = {
  not_signed_in: 'Your session was not found. Sign in again to continue.',
  not_platform_staff:
    'You are signed in, but this account is not a platform admin. Only accounts in platform_staff can open the console.',
  read_only: 'Your account has read only support access and cannot open that page.',
};

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <Section>
      <div className="mx-auto max-w-sm">
        <h1 className="text-h1">Platform admin</h1>
        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-body text-danger">
            {GUARD_MESSAGES[error] ?? 'You are not allowed to view that page.'}
          </p>
        ) : null}
        <div className="mt-6"><StaffLoginForm next="/" loginPath="/login" /></div>
      </div>
    </Section>
  );
}
