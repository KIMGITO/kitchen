import { requirePlatform } from '@/lib/auth/platform';
import { createClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { savePlan } from '@/lib/actions/admin';

export default async function Plans() {
  const role = await requirePlatform();
  const supabase = await createClient();
  const [{ data: plans }, { data: features }, { data: pf }] = await Promise.all([
    supabase.from('plans').select('key, name, price_minor, is_active').order('sort_order'),
    supabase.from('features').select('key, description, kind').order('kind').order('key'),
    supabase.from('plan_features').select('plan_key, feature_key, enabled, limit_value'),
  ]);
  return (
    <div className="flex max-w-4xl flex-col gap-8"><h1 className="text-h1">Plans and features</h1>
      <p className="text-body text-ink-soft">Tick the features each plan includes. Leave a limit empty for unlimited. Kitchens pick up changes immediately.</p>
      {(plans ?? []).map((p: { key: string; name: string; price_minor: number; is_active: boolean }) => (
        <section key={p.key} aria-labelledby={`p-${p.key}`} className="rounded-lg border border-line bg-surface p-5">
          <h2 id={`p-${p.key}`} className="mb-4 text-h2">{p.name}</h2>
          <fieldset disabled={role === 'support'} className="contents">
            <ActionForm action={savePlan} submitLabel="Save plan"><input type="hidden" name="plan" value={p.key} />
              <div className="grid gap-4 sm:grid-cols-3"><Input label="Name" name="name" defaultValue={p.name} /><Input label="Monthly price (KSh)" name="price" inputMode="numeric" defaultValue={String(p.price_minor / 100)} />
                <label className="flex h-11 items-center gap-2 self-end"><input type="checkbox" name="active" defaultChecked={p.is_active} className="size-4 accent-brand" />Offered to new kitchens</label></div>
              <ul className="grid gap-2 sm:grid-cols-2">{(features ?? []).map((f: { key: string; description: string; kind: string }) => {
                const row = (pf ?? []).find((x: { plan_key: string; feature_key: string }) => x.plan_key === p.key && x.feature_key === f.key) as { enabled: boolean; limit_value: number | null } | undefined;
                return (<li key={f.key} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name={`on_${f.key}`} defaultChecked={row?.enabled ?? false} className="size-4 accent-brand" /><span className="text-body">{f.description}</span></label>
                  {f.kind === 'limit' ? <input aria-label={`${f.description} limit`} name={`limit_${f.key}`} inputMode="numeric" defaultValue={row?.limit_value ?? ''} placeholder="∞" className="h-9 w-20 rounded-md border border-line px-2 text-right" /> : null}</li>); })}</ul>
            </ActionForm></fieldset></section>))}
    </div>
  );
}
