import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { saveCategory, deleteCategory } from '@/lib/actions/menu';

export default async function Categories() {
  await requirePermission('menu.manage');
  const tenant = await getTenant(); const supabase = await createClient();
  const { data } = await supabase.from('categories').select('id, name, sort_order').eq('tenant_id', tenant.id).is('deleted_at', null).order('sort_order');
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <h1 className="text-h1">Categories</h1>
      {(data ?? []).length === 0 ? <p className="text-body text-ink-soft">No categories yet. Categories group your menu on the storefront.</p> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface px-4">{(data ?? []).map((c: { id: string; name: string; sort_order: number }) => (
          <li key={c.id} className="flex items-center justify-between py-3"><span>{c.name} <span className="text-caption text-ink-soft">order {c.sort_order}</span></span>
            <form action={deleteCategory}><input type="hidden" name="id" value={c.id} /><Button type="submit" size="sm" variant="ghost">Delete</Button></form></li>))}</ul>)}
      <ActionForm action={saveCategory} submitLabel="Add category" className="grid items-end gap-3 sm:grid-cols-[1fr_7rem_auto]">
        <Input label="Name" name="name" required /><Input label="Sort order" name="sort_order" inputMode="numeric" defaultValue="0" /></ActionForm>
    </div>
  );
}
