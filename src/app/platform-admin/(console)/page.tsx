import Link from 'next/link';
import { requirePlatform } from '@/lib/auth/platform';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { setTenantStatus } from '@/lib/actions/admin';

export default async function AdminHome() {
  const role = await requirePlatform();
  const supabase = await createClient();
  const count = async (status: string) => (await supabase.from('tenants').select('id', { count: 'exact', head: true }).eq('status', status).is('deleted_at', null)).count ?? 0;
  const [pending, active, suspended, refunds, { data: queue }] = await Promise.all([
    count('pending_approval'), count('active'), count('suspended'),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('needs_refund', true).then((r) => r.count ?? 0),
    supabase.from('tenants').select('id, name, slug, created_at').eq('status', 'pending_approval').is('deleted_at', null).order('created_at').limit(10),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-h1 text-ink-muted">Overview</h1>
      <p className="text-body-lg text-ink-soft">{active} active kitchens • {pending} awaiting approval • {suspended} suspended{refunds > 0 ? <> • <Link href="/finance" className="font-semibold text-danger">{refunds} payments need a refund</Link></> : null}</p>

      <section aria-labelledby="q-h">
        <h2 id="q-h" className="mb-3 text-h2 text-ink-muted">Awaiting approval</h2>
        {(queue ?? []).length === 0 ? <EmptyState title="No kitchens waiting" /> : (
          <ul className="divide-y divide-line">
            {(queue ?? []).map((k: { id: string; name: string; slug: string }) => (
              <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <Link href={`/kitchens/${k.id}`} className="underline text-ink-muted">{k.name} <span className="block text-caption text-ink-soft">({k.slug})</span></Link>
                {role !== 'support' ? (
                  <form action={setTenantStatus}>
                    <input type="hidden" name="id" value={k.id} />
                    <input type="hidden" name="status" value="active" />
                    <Button size="sm" variant="primary">Approve</Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
