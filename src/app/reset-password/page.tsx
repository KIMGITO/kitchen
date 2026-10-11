import { Section } from '@/components/ui/Section';
import { ResetPasswordForm } from '@/components/auth/PasswordForms';
import { safePath } from '@/lib/auth/reset';

export const metadata = { title: 'Choose a new password', robots: { index: false, follow: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const { return: returnTo } = await searchParams;
  return (
    <Section className="flex flex-col items-center">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-h1 text-ink-muted">Choose a new password</h1>
        <p className="mt-2 text-body-lg text-ink-soft">Enter a new password for your account.</p>
        <div className="mt-6"><ResetPasswordForm returnTo={safePath(returnTo, '/login')} /></div>
      </div>
    </Section>
  );
}
