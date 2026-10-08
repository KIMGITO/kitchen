import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { Section } from '@/components/ui/Section';
import { RegisterForm } from '@/components/storefront/AuthForms';

export const metadata = { title: 'Create account', robots: { index: false } };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [tenant, { next }] = await Promise.all([getActiveTenant(), searchParams]);
  return (
    <Section><div className="mx-auto max-w-sm">
      <h1 className="text-h1">Create account</h1>
      <p className="mb-6 mt-1 text-body text-ink-soft">Order from {tenant.name} and track your orders.</p>
      <RegisterForm tenantId={tenant.id} tenantName={tenant.name} next={next} />
    </div></Section>
  );
}
