import Link from 'next/link';
import { requirePlatform } from '@/lib/auth/platform';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pager, pageOf, range, PAGE_SIZE } from '@/components/ui/Pager';
import { Card } from '@/components/ui/primitives/Card';
import { Badge } from '@/components/ui/primitives/Badge';
import { setTenantStatus } from '@/lib/actions/admin';

export default async function Kitchens({ searchParams }: { searchParams: Promise<{ page?: string; status?: string }> }) {
  const role = await requirePlatform();
  const { page: raw, status } = await searchParams;
  const page = pageOf(raw); const [from, to] = range(page);
  const supabase = await createClient();
  let q = supabase.from('tenants').select('id, name, slug, status, created_at, subscriptions(plan_key, status)').is('deleted_at', null);
  if (status && ['pending_approval', 'active', 'suspended', 'closed'].includes(status)) q = q.eq('status', status);
  const { data } = await q.order('created_at', { ascending: false }).range(from, to + 1);
  const rows = (data ?? []) as unknown as { id: string; name: string; slug: string; status: string; subscriptions: { plan_key: string; status: string }[] }[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-ink-muted">Kitchens</h1>
        <p className="text-body-lg text-ink-muted/70">{rows.length} kitchen{(rows.length ?? 0) === 1 ? ' is' : 's are'} pending or active</p>
      </div>

      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {[['', 'All'], ['pending_approval', 'Pending'], ['active', 'Active'], ['suspended', 'Suspended']].map(([v, l]) => (
          <Link key={v} href={v ? `/kitchens?status=${v}` : '/kitchens'}
            className={`inline-flex h-11 items-center rounded-pill border px-4 text-label transition-all ${status === v ? 'border-brand bg-brand text-brand-contrast shadow-sm' : 'border-line/60 bg-surface text-ink-muted hover:border-brand/40 hover:text-ink'}`}>{l}</Link>
        ))}
      </nav>

      {rows.length === 0 ? <EmptyState title="No kitchens found" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {(rows as { id: string; name: string; slug: string; status: string; subscriptions: { plan_key: string; status: string }[] }[]).map((k) => {
            const sub = k.subscriptions.find((s) => ['trialing', 'active', 'past_due'].includes(s.status));
            return (
              <Card key={k.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-h3 text-ink-muted">{k.name}</p>
                    <p className="truncate text-caption text-ink-muted/60">{k.slug}.this-domain</p>
                  </div>
                  <Badge tone={k.status === 'active' ? 'success' : k.status === 'suspended' ? 'danger' : 'brand'}>{k.status.replace('_', ' ')}</Badge>
                </div>
                <p className="text-body text-ink-muted/70">Plan: {sub ? `${sub.plan_key} (${sub.status})` : '—'}</p>
                <div className="flex justify-end">
                  <form action={setTenantStatus} className="inline">
                    <input type="hidden" name="id" value={k.id} />
                    {k.status === 'active' ? (
                      <>
                        <input type="hidden" name="status" value="suspended" />
                        <Button size="sm" variant="outline">Suspend</Button>
                      </>
                    ) : (
                      <>
                        <input type="hidden" name="status" value="active" />
                        <Button size="sm" variant="primary">{k.status === 'pending_approval' ? 'Approve' : 'Activate'}</Button>
                      </>
                    )}
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath={`/kitchens${status ? `?status=${status}` : ''}`} />
    </div>
  );
}
