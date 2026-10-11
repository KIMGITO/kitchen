import { Section } from '@/components/ui/Section';
import { ForgotPasswordForm } from '@/components/auth/PasswordForms';
import { safePath } from '@/lib/auth/reset';

export const metadata = { title: 'Forgot password', robots: { index: false, follow: false } };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ return?: string }> }) {
  const { return: returnTo } = await searchParams;
  return (
    <Section className="flex flex-col items-center">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-h1 text-ink-muted">Forgot password</h1>
        <p className="mt-2 text-body-lg text-ink-soft">Enter your email and we&apos;ll send you a link to choose a new password.</p>
        <div className="mt-6"><ForgotPasswordForm returnTo={safePath(returnTo, '/login')} /></div>
      </div>
    </Section>
  );
}
