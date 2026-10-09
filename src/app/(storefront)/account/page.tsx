import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getActiveTenant } from '@/lib/tenant/get-tenant';
import { getKitchenCustomer, getUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { Input } from '@/components/ui/Input';
import { ActionForm } from '@/components/ui/ActionForm';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { LogoutButton } from '@/components/account/LogoutButton';
import { addAddress, deleteAddress, updateProfile } from '@/lib/actions/account';

export const metadata = { title: 'Your account', robots: { index: false } };

export default async function AccountPage() {
  const tenant = await getActiveTenant();
  if (!(await getUser())) redirect('/login?next=/account');
  const customer = await getKitchenCustomer();
  if (!customer) redirect('/register?next=/account');

  const supabase = await createClient();
  const [{ data: addresses }, { data: prefs }] = await Promise.all([
    supabase.from('customer_addresses').select('id, label, address_line, area').eq('tenant_id', tenant.id)
      .eq('kitchen_customer_id', customer.id).is('deleted_at', null),
    supabase.from('kitchen_customers').select('marketing_opt_in').eq('id', customer.id).single(),
  ]);

  return (
    <Section>
      <div className="mx-auto flex max-w-2xl flex-col gap-10">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-h1">Your account</h1><LogoutButton />
        </div>
        {customer.status === 'blocked' ? <p role="alert" className="rounded-lg bg-danger/10 p-4 text-danger">This account cannot place orders. Contact {tenant.name}.</p> : null}
        <p><Link href="/account/orders" className="text-label underline">View your orders at {tenant.name}</Link></p>

        <section aria-labelledby="profile-h" className="flex flex-col gap-4">
          <h2 id="profile-h" className="text-h2">Details</h2>
          <ActionForm action={updateProfile} submitLabel="Save details">
            <Input label="Full name" name="full_name" defaultValue={customer.full_name} required minLength={2} />
            <PhoneInput label="Mobile number" name="phone" required defaultValue={customer.phone} hint="Receipts and order updates are sent to this number." />
            <label className="flex items-center gap-2 text-body"><input type="checkbox" name="marketing" defaultChecked={prefs?.marketing_opt_in ?? false} className="size-4 accent-brand" />Send me offers from {tenant.name}</label>
          </ActionForm>
          <p className="text-caption text-ink-soft">This account belongs to {tenant.name} only. Other kitchens keep their own separate accounts.</p>
        </section>

        <section aria-labelledby="addr-h" className="flex flex-col gap-4">
          <h2 id="addr-h" className="text-h2">Delivery addresses</h2>
          {addresses && addresses.length > 0 ? (
            <ul className="divide-y divide-line rounded-lg border border-line px-4">
              {addresses.map((a: { id: string; label: string | null; address_line: string; area: string | null }) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-3">
                  <span>{a.label ? <strong>{a.label}: </strong> : null}{a.address_line}{a.area ? `, ${a.area}` : ''}</span>
                  <form action={deleteAddress}><input type="hidden" name="id" value={a.id} /><Button type="submit" variant="ghost" size="sm">Remove</Button></form>
                </li>))}
            </ul>) : <p className="text-body text-ink-soft">No saved addresses yet.</p>}
          <ActionForm action={addAddress} submitLabel="Add address">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Label" name="label" placeholder="Home, Office" /><Input label="Area" name="area" />
              <div className="sm:col-span-2"><Input label="Street / building / house number" name="address_line" required minLength={5} /></div>
              <div className="sm:col-span-2"><Input label="Directions" name="instructions" /></div>
            </div>
          </ActionForm>
        </section>
      </div>
    </Section>
  );
}
