import { notFound } from 'next/navigation';
import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { ProductForm } from '@/components/kitchen/ProductForm';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { addOption, addOptionGroup, deleteOptionRow } from '@/lib/actions/menu';
import { formatMoney } from '@/lib/commerce/money';
import { minorToShillings } from '@/lib/money-input';

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('menu.manage');
  const [{ id }, tenant] = await Promise.all([params, getTenant()]);
  const supabase = await createClient();
  const { data: categories } = await supabase.from('categories').select('id, name').eq('tenant_id', tenant.id).is('deleted_at', null).order('sort_order');

  if (id === 'new') {
    return (<div className="flex max-w-2xl flex-col gap-6"><h1 className="text-h1">New item</h1>
      <ProductForm tenantId={tenant.id} categories={categories ?? []} /></div>);
  }
  const { data: p } = await supabase.from('products').select('*').eq('id', id).eq('tenant_id', tenant.id).is('deleted_at', null).maybeSingle();
  if (!p) notFound();
  const { data: groups } = await supabase.from('product_option_groups')
    .select('id, name, min_select, max_select, product_options(id, name, price_delta_minor)').eq('tenant_id', tenant.id).eq('product_id', id).order('sort_order');

  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <div><h1 className="text-h1">{p.name}</h1>
        <div className="mt-6"><ProductForm tenantId={tenant.id} categories={categories ?? []} values={{
          id: p.id, name: p.name, slug: p.slug, description: p.description ?? '', category_id: p.category_id ?? '', price: minorToShillings(p.price_minor),
          prep_minutes: p.prep_minutes?.toString() ?? '', calories: p.calories?.toString() ?? '', is_available: p.is_available, image_url: p.image_url }} /></div></div>

      <section aria-labelledby="opts-h" className="flex flex-col gap-4">
        <h2 id="opts-h" className="text-h2">Options</h2>
        <p className="text-body text-ink-soft">For sizes, extras or sides. Set a minimum of 1 to make a choice required.</p>
        {(groups ?? []).map((g: { id: string; name: string; min_select: number; max_select: number; product_options: { id: string; name: string; price_delta_minor: number }[] }) => (
          <div key={g.id} className="rounded-lg border border-line p-4">
            <div className="flex items-center justify-between"><h3 className="text-h3">{g.name} <span className="text-caption text-ink-soft">(choose {g.min_select}–{g.max_select})</span></h3>
              <form action={deleteOptionRow}><input type="hidden" name="id" value={g.id} /><input type="hidden" name="kind" value="group" /><Button type="submit" size="sm" variant="ghost">Delete group</Button></form></div>
            <ul className="mt-2 divide-y divide-line">{g.product_options.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2"><span>{o.name} {o.price_delta_minor > 0 ? <span className="text-caption text-ink-soft">+{formatMoney(o.price_delta_minor, tenant.currency)}</span> : null}</span>
                <form action={deleteOptionRow}><input type="hidden" name="id" value={o.id} /><input type="hidden" name="kind" value="option" /><Button type="submit" size="sm" variant="ghost">Remove</Button></form></li>))}</ul>
            <div className="mt-3"><ActionForm action={addOption} submitLabel="Add option" className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_auto]">
              <input type="hidden" name="group_id" value={g.id} /><Input label="Option name" name="name" required /><Input label="Extra (KSh)" name="price" inputMode="numeric" defaultValue="0" /></ActionForm></div>
          </div>))}
        <ActionForm action={addOptionGroup} submitLabel="Add option group" className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_6rem_auto]">
          <input type="hidden" name="product_id" value={id} /><Input label="Group name" name="name" placeholder="Size, Extras" required />
          <Input label="Min" name="min_select" inputMode="numeric" defaultValue="0" /><Input label="Max" name="max_select" inputMode="numeric" defaultValue="1" /></ActionForm>
      </section>
    </div>
  );
}
