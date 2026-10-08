import Link from 'next/link';
import { requirePlatform } from '@/lib/auth/platform';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pager, pageOf, range, PAGE_SIZE } from '@/components/ui/Pager';
import { Card, CardBlock } from '@/components/ui/primitives/Card';
import { Badge } from '@/components/ui/primitives/Badge';

const TABS = [['customers', 'Customers'], ['staff', 'Kitchen staff'], ['platform', 'Platform team']] as const;

export default async function Users({ searchParams }: { searchParams: Promise<{ tab?: string; page?: string }> }) {
  await requirePlatform();
  const { tab = 'customers', page: raw } = await searchParams;
  const page = pageOf(raw); const [from, to] = range(page); const supabase = await createClient();
  let rows: { id: string; name: string; detail: string }[] = []; let more = false;

  if (tab === 'customers') {
    const { data } = await supabase.from('kitchen_customers').select('id, full_name, email, status, tenants(name)').order('created_at', { ascending: false }).range(from, to + 1);
    more = (data ?? []).length > PAGE_SIZE;
    rows = ((data ?? []) as unknown as { id: string; full_name: string; email: string | null; status: string; tenants: { name: string } | null }[]).slice(0, PAGE_SIZE).map((c) => ({ id: c.id, name: c.full_name, detail: `${c.email ?? ''} • customer of ${c.tenants?.name} • ${c.status}` }));
  } else if (tab === 'staff') {
    const { data } = await supabase.from('tenant_members').select('id, role_key, is_active, user_id, tenants(name), profiles(full_name)').order('created_at', { ascending: false }).range(from, to + 1);
    more = (data ?? []).length > PAGE_SIZE;
    rows = ((data ?? []) as unknown as { id: string; role_key: string; is_active: boolean; tenants: { name: string } | null; profiles: { full_name: string | null } | null }[]).slice(0, PAGE_SIZE).map((m) => ({ id: m.id, name: m.profiles?.full_name ?? 'Unnamed', detail: `${m.role_key.replace('_', ' ')} at ${m.tenants?.name}${m.is_active ? '' : ' • deactivated'}` }));
  } else {
    const { data } = await supabase.from('platform_staff').select('user_id, role, profiles(full_name)');
    rows = ((data ?? []) as unknown as { user_id: string; role: string; profiles: { full_name: string | null } | null }[]).map((p) => ({ id: p.user_id, name: p.profiles?.full_name ?? 'Unnamed', detail: p.role }));
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1 text-ink-muted">Users</h1>
        <p className="text-body-lg text-ink-soft">{rows.length} user{rows.length === 1 ? '' : 's'} listed</p>
      </div>

      <nav aria-label="User types" className="flex flex-wrap gap-2">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/users?tab=${k}`}
            className={`inline-flex h-11 items-center rounded-pill border px-4 text-label transition-all ${tab === k ? 'border-brand bg-brand text-brand-contrast shadow-sm' : 'border-line/60 bg-surface text-ink-muted hover:border-brand/40 hover:text-ink'}`}>{l}</Link>
        ))}
      </nav>

      {rows.length === 0 ? <EmptyState title="Nobody here yet" /> : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-h3 text-ink-muted">{r.name}</p>
                <Badge tone="surface">{r.detail.split(' • ')[2]?.replace(/_/g, ' ') ?? ''}</Badge>
              </div>
              <p className="mt-1 text-body text-ink-soft">{r.detail}</p>
            </Card>
          ))}
        </div>
      )}

      <Pager page={page} hasMore={more} basePath={`/users?tab=${tab}`} />
      {tab === 'platform' ? <p className="text-caption text-ink-soft">Platform team members are added by the owner in the database (see README).</p> : null}
    </div>
  );
}
