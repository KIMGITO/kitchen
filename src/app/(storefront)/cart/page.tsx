import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { Section } from '@/components/ui/Section';
import { CartView } from '@/components/storefront/CartView';

export const metadata = { title: 'Your cart', robots: { index: false } };

export default async function CartPage() {
  const tenant = await getActiveTenant();
  return (
    <Section>
      <h1 className="text-h1">Your cart</h1>
      <div className="mt-6"><CartView tenantId={tenant.id} currency={tenant.currency} minOrderMinor={tenant.min_order_minor} /></div>
    </Section>
  );
}
