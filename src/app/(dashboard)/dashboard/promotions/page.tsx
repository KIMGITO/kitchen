import Image from 'next/image';
import { requirePermission } from '@/lib/auth/session';
import { getEntitlements } from '@/lib/auth/entitlements';
import { getTenant } from '@/lib/tenant/get-tenant';
import { createClient } from '@/lib/supabase/server';
import { PromotionForm } from '@/components/kitchen/PromotionForm';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/primitives/Badge';
import { deletePromotion, setPromotionActive } from '@/lib/actions/promotions';

type Row = { id: string; title: string; subtitle: string | null; image_url: string | null; discount_percent: number | null; is_active: boolean; starts_at: string; ends_at: string | null };

export default async function Promotions() {
  await requirePermission('menu.manage');
  const [tenant, ent] = await Promise.all([getTenant(), getEntitlements()]);
  if (!ent.hasFeature('promotions')) {
    return (<div className="flex max-w-xl flex-col gap-3"><h1 className="text-h1">Promotions</h1>
      <p className="rounded-lg border border-line bg-tint-alt p-4 text-body text-ink">Image ads and deals are part of the Advanced plan. Upgrade to show swipeable offers on your storefront.</p></div>);
  }
  const supabase = await createClient();
  const [{ data: rows }, { data: products }] = await Promise.all([
    supabase.from('promotions').select('id, title, subtitle, image_url, discount_percent, is_active, starts_at, ends_at').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(50),
    supabase.from('products').select('id, name').eq('tenant_id', tenant.id).is('deleted_at', null).order('name').limit(300),
  ]);
  const now = Date.now();
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div><h1 className="text-h1">Promotions</h1><p className="mt-1 text-body text-ink-soft">Image ads appear as a swipeable strip at the top of your storefront.</p></div>
      <section aria-labelledby="new-h" className="rounded-lg border border-line bg-surface p-5 shadow-card">
        <h2 id="new-h" className="mb-4 text-h2">New promotion</h2>
        <PromotionForm tenantId={tenant.id} products={(products ?? []) as { id: string; name: string }[]} />
      </section>
      <section aria-labelledby="live-h">
        <h2 id="live-h" className="mb-3 text-h2">Your promotions</h2>
        {(rows ?? []).length === 0 ? <p className="text-body text-ink-soft">None yet.</p> : (
          <ul className="flex flex-col gap-3">
            {(rows as Row[]).map((r) => {
              const expired = r.ends_at ? new Date(r.ends_at).getTime() <= now : false;
              return (
                <li key={r.id} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-3">
                  <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded-md bg-line/40">{r.image_url ? <Image src={r.image_url} alt="" fill sizes="112px" className="object-cover" /> : null}</div>
                  <div className="min-w-0 flex-1"><p className="truncate text-label text-ink">{r.title}</p>
                    <p className="text-caption text-ink-soft">{r.discount_percent ? `${r.discount_percent}% off · ` : ''}{r.ends_at ? `ends ${new Date(r.ends_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}` : 'no end date'}</p></div>
                  <Badge tone={expired ? 'ghost' : r.is_active ? 'success' : 'ghost'}>{expired ? 'Expired' : r.is_active ? 'Live' : 'Paused'}</Badge>
                  <form action={setPromotionActive}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={r.is_active ? 'false' : 'true'} /><Button type="submit" size="sm" variant="outline">{r.is_active ? 'Pause' : 'Resume'}</Button></form>
                  <form action={deletePromotion}><input type="hidden" name="id" value={r.id} /><Button type="submit" size="sm" variant="ghost">Delete</Button></form>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
