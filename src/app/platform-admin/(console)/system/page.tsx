import { requirePlatform } from '@/lib/auth/platform';
import { createClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pager, pageOf, range, PAGE_SIZE } from '@/components/ui/Pager';
import { saveSetting } from '@/lib/actions/admin';

export default async function System({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const role = await requirePlatform();
  const { page: raw } = await searchParams; const page = pageOf(raw); const [from, to] = range(page);
  const supabase = await createClient();
  const [{ data: root }, { data: logs }] = await Promise.all([
    supabase.from('platform_settings').select('value').eq('key', 'root_domain').maybeSingle(),
    supabase.from('audit_logs').select('id, action, entity_type, metadata, created_at, tenants(name)').order('id', { ascending: false }).range(from, to + 1),
  ]);
  const rows = (logs ?? []) as unknown as { id: number; action: string; entity_type: string; metadata: Record<string, unknown>; created_at: string; tenants: { name: string } | null }[];
  return (
    <div className="flex max-w-4xl flex-col gap-10"><h1 className="text-h1">System</h1>
      <section aria-labelledby="s-h" className="flex flex-col gap-3"><h2 id="s-h" className="text-h2">Platform settings</h2>
        <ActionForm action={saveSetting} submitLabel="Save domain"><input type="hidden" name="key" value="root_domain" />
          <fieldset disabled={role !== 'owner'} className="contents"><Input label="Root domain" name="value" defaultValue={String(root?.value ?? '')} hint={role === 'owner' ? 'Kitchens are served at their-name.this-domain. Match NEXT_PUBLIC_ROOT_DOMAIN.' : 'Only the platform owner can change this.'} /></fieldset></ActionForm></section>
      <section aria-labelledby="a-h"><h2 id="a-h" className="mb-3 text-h2">Audit log</h2>
        {rows.length === 0 ? <EmptyState title="No activity recorded yet" /> : (
          <div className="overflow-x-auto rounded-lg bg-surface shadow-card"><table className="w-full text-left"><caption className="sr-only">Audit log</caption>
            <thead className="border-b border-line text-label text-ink-soft"><tr><th scope="col" className="p-3">When</th><th scope="col" className="p-3">Action</th><th scope="col" className="p-3">Kitchen</th><th scope="col" className="p-3">Details</th></tr></thead>
            <tbody>{rows.slice(0, PAGE_SIZE).map((l) => (<tr key={l.id} className="border-b border-line align-top last:border-0"><td className="whitespace-nowrap p-3 text-ink-soft">{new Date(l.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td className="p-3">{l.action}</td><td className="p-3">{l.tenants?.name ?? '—'}</td><td className="p-3 font-mono text-caption text-ink-soft">{JSON.stringify(l.metadata)}</td></tr>))}</tbody></table></div>)}
        <Pager page={page} hasMore={rows.length > PAGE_SIZE} basePath="/system" /></section>
    </div>
  );
}
