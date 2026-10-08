import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { Section } from '@/components/ui/Section';
import { LoginForm } from '@/components/storefront/AuthForms';

export const metadata = { title: 'Log in', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [tenant, { next }] = await Promise.all([getActiveTenant(), searchParams]);
  return (
    <Section><div className="mx-auto max-w-sm">
      <h1 className="text-h1">Log in</h1>
      <p className="mb-6 mt-1 text-body text-ink-soft">Your {tenant.name} account.</p>
      <LoginForm tenantId={tenant.id} tenantName={tenant.name} next={next} />
    </div></Section>
  );
}
