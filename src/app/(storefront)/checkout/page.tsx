import { redirect } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { getKitchenCustomer, getUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';

export const metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage() {
  const tenant = await getActiveTenant();
  const user = await getUser();
  if (!user) redirect('/login?next=/checkout');
  const customer = await getKitchenCustomer();
  if (!customer) redirect('/register?next=/checkout');
  if (customer.status !== 'active') redirect('/account');

  const supabase = await createClient();
  const { data: addresses } = await supabase.from('customer_addresses').select('id, label, address_line, area')
    .eq('tenant_id', tenant.id).eq('kitchen_customer_id', customer.id).is('deleted_at', null).order('is_default', { ascending: false });

  return (
    <Section className="flex flex-col gap-10">
      <h1 className="text-h1 text-ink-muted">Checkout</h1>
      <div className="mt-6">
        <CheckoutForm tenantId={tenant.id} currency={tenant.currency} pickupEnabled={tenant.pickup_enabled} deliveryEnabled={tenant.delivery_enabled}
          deliveryFeeMinor={tenant.delivery_fee_minor} minOrderMinor={tenant.min_order_minor}
          customer={{ id: customer.id, fullName: customer.full_name, phone: customer.phone }} addresses={addresses ?? []} />
      </div>
    </Section>
  );
}
