'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from './Button';
import { Icon } from './primitives/Icon';
import { cn } from './cn';
import { NOTIFICATIONS_CHANGED } from './NotificationBell';
import { friendlyError } from '@/lib/errors';
import { toast } from '@/stores/toast';

export interface NotificationRow {
  id: string; title: string; body: string | null; kind: string; data: { order_id?: string };
  read_at: string | null; created_at: string; audience: 'customer' | 'kitchen';
}
const COLS = 'id, title, body, kind, data, read_at, created_at, audience';
const PAGE = 30;
const when = (iso: string) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' });

/** Full notifications page: filter, mark read/unread, delete, bulk actions, live updates. All changes are optimistic with rollback. */
export function NotificationCenter({ tenantId, audience, initial, hasMoreInitial }: { tenantId: string; audience: 'customer' | 'kitchen'; initial: NotificationRow[]; hasMoreInitial: boolean }) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(hasMoreInitial);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowBusy, setRowBusy] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const orderHref = (n: NotificationRow) => n.data.order_id ? (audience === 'customer' ? `/orders/${n.data.order_id}` : '/dashboard/orders') : null;
  const unreadCount = items.filter((i) => !i.read_at).length;
  const visible = useMemo(() => (filter === 'unread' ? items.filter((i) => !i.read_at) : items), [items, filter]);

  const refresh = useCallback(async () => {
    const { data } = await createClient().from('notifications').select(COLS).eq('tenant_id', tenantId).eq('audience', audience)
      .order('created_at', { ascending: false }).limit(PAGE);
    if (data) setItems((cur) => {
      const older = cur.filter((c) => !data.some((d) => d.id === c.id) && new Date(c.created_at) < new Date(data[data.length - 1]?.created_at ?? 0));
      return [...(data as NotificationRow[]), ...older];
    });
  }, [tenantId, audience]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`center:${tenantId}:${audience}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `tenant_id=eq.${tenantId}` }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [tenantId, audience, refresh]);

  const announce = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
  const withBusy = (ids: string[], on: boolean) => setRowBusy((s) => { const n = new Set(s); ids.forEach((i) => (on ? n.add(i) : n.delete(i))); return n; });

  async function run(opts: { ids?: string[]; bulk?: string; apply: () => void; call: () => PromiseLike<{ error: { message: string } | null }>; ok: string }) {
    const prev = items; const prevSel = selected;
    if (opts.ids) withBusy(opts.ids, true);
    if (opts.bulk) setBulkBusy(opts.bulk);
    opts.apply();
    const { error } = await opts.call();
    if (opts.ids) withBusy(opts.ids, false);
    setBulkBusy(null);
    if (error) { setItems(prev); setSelected(prevSel); toast.error(friendlyError(error.message)); return; }
    toast.success(opts.ok); announce();
  }

  const supabase = () => createClient();
  const setRead = (ids: string[], read: boolean, bulk?: string) => run({
    ids, bulk, ok: read ? 'Marked as read.' : 'Marked as unread.',
    apply: () => setItems((cur) => cur.map((i) => (ids.includes(i.id) ? { ...i, read_at: read ? i.read_at ?? new Date().toISOString() : null } : i))),
    call: () => supabase().rpc('set_notifications_read', { p_tenant: tenantId, p_ids: ids, p_read: read }),
  });
  const remove = (ids: string[], bulk?: string) => run({
    ids, bulk, ok: ids.length === 1 ? 'Notification deleted.' : `${ids.length} notifications deleted.`,
    apply: () => { setItems((cur) => cur.filter((i) => !ids.includes(i.id))); setSelected((s) => new Set([...s].filter((i) => !ids.includes(i)))); },
    call: () => supabase().rpc('delete_notifications', { p_tenant: tenantId, p_ids: ids }),
  });
  const markAll = () => run({
    bulk: 'all', ok: 'All notifications marked as read.',
    apply: () => setItems((cur) => cur.map((i) => ({ ...i, read_at: i.read_at ?? new Date().toISOString() }))),
    call: () => supabase().rpc('mark_all_notifications_read', { p_tenant: tenantId, p_audience: audience }),
  });
  const clearRead = () => {
    if (!items.some((i) => i.read_at) || !confirm('Delete all notifications you have already read?')) return;
    void run({
      bulk: 'clear', ok: 'Read notifications deleted.',
      apply: () => setItems((cur) => cur.filter((i) => !i.read_at)),
      call: () => supabase().rpc('delete_read_notifications', { p_tenant: tenantId, p_audience: audience }),
    });
  };
  async function loadMore() {
    setBulkBusy('more');
    const last = items[items.length - 1]?.created_at;
    const { data } = await supabase().from('notifications').select(COLS).eq('tenant_id', tenantId).eq('audience', audience)
      .lt('created_at', last).order('created_at', { ascending: false }).limit(PAGE + 1);
    setBulkBusy(null);
    const rows = (data ?? []) as NotificationRow[];
    setHasMore(rows.length > PAGE);
    setItems((cur) => [...cur, ...rows.slice(0, PAGE)]);
  }

  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allVisibleSelected = visible.length > 0 && visible.every((v) => selected.has(v.id));
  const selIds = [...selected];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter notifications" className="inline-flex rounded-pill border border-line bg-surface p-1">
          {(['all', 'unread'] as const).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} type="button" onClick={() => setFilter(f)}
              className={cn('h-9 rounded-pill px-4 text-label transition-colors', filter === f ? 'bg-accent text-accent-contrast' : 'text-ink-muted hover:bg-accent-soft')}>
              {f === 'all' ? 'All' : `Unread${unreadCount ? ` (${unreadCount})` : ''}`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" loading={bulkBusy === 'all'} loadingText="Marking…" autoLoading={false} disabled={unreadCount === 0} onClick={markAll}><Icon name="checks" size={16} />Mark all read</Button>
          <Button type="button" size="sm" variant="ghost" loading={bulkBusy === 'clear'} loadingText="Deleting…" autoLoading={false} disabled={!items.some((i) => i.read_at)} onClick={clearRead}><Icon name="trash" size={16} />Clear read</Button>
        </div>
      </div>

      {selected.size > 0 ? (
        <div role="region" aria-label="Selected notifications" className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/60 bg-accent-soft p-3 animate-fade-in">
          <span className="text-label text-ink">{selected.size} selected</span>
          <Button type="button" size="sm" variant="outline" loading={bulkBusy === 'sel-read'} autoLoading={false} onClick={() => setRead(selIds, true, 'sel-read')}><Icon name="mark-read" size={16} />Mark read</Button>
          <Button type="button" size="sm" variant="outline" loading={bulkBusy === 'sel-unread'} autoLoading={false} onClick={() => setRead(selIds, false, 'sel-unread')}><Icon name="mark-unread" size={16} />Mark unread</Button>
          <Button type="button" size="sm" variant="danger" loading={bulkBusy === 'sel-del'} autoLoading={false} onClick={() => remove(selIds, 'sel-del')}><Icon name="trash" size={16} />Delete</Button>
          <button type="button" className="ml-auto text-caption underline" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-lg border border-dashed border-line bg-surface p-10 text-center">
          <Icon name="bell" size={36} className="text-ink-soft" />
          <p className="text-h3 text-ink">{filter === 'unread' ? "You're all caught up" : 'No notifications yet'}</p>
          <p className="text-body text-ink-soft">{filter === 'unread' ? 'Nothing unread right now.' : 'Order updates and receipts will show up here.'}</p>
        </div>
      ) : (
        <>
          <label className="flex w-fit cursor-pointer items-center gap-2 text-caption text-ink-soft">
            <input type="checkbox" className="size-4 accent-brand" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((v) => v.id)))} />
            Select all
          </label>
          <ul className="flex flex-col gap-2" aria-label="Notifications">
            {visible.map((n) => {
              const href = orderHref(n); const unread = !n.read_at; const busy = rowBusy.has(n.id);
              const content = (
                <>
                  <span className="text-body text-ink"><span className={unread ? 'font-semibold' : ''}>{n.title}</span></span>
                  {n.body ? <span className="mt-0.5 line-clamp-2 whitespace-pre-line text-caption text-ink-soft">{n.body}</span> : null}
                  <span className="mt-1 text-caption text-ink-soft">{when(n.created_at)}</span>
                </>
              );
              return (
                <li key={n.id} aria-busy={busy || undefined}
                  className={cn('flex items-start gap-3 rounded-lg border p-3 transition duration-200', unread ? 'border-accent/50 bg-accent-soft/50' : 'border-line bg-surface', busy && 'pointer-events-none opacity-60')}>
                  <input type="checkbox" aria-label={`Select: ${n.title}`} className="mt-1 size-4 shrink-0 accent-brand" checked={selected.has(n.id)} onChange={() => toggle(n.id)} />
                  <span aria-hidden className={cn('mt-2 size-2.5 shrink-0 rounded-full', unread ? 'bg-accent' : 'bg-transparent')} />
                  {href ? (
                    <Link href={href} onClick={() => unread && void setRead([n.id], true)} className="flex min-w-0 flex-1 flex-col">{content}</Link>
                  ) : <div className="flex min-w-0 flex-1 flex-col">{content}</div>}
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setRead([n.id], unread)} aria-label={unread ? 'Mark as read' : 'Mark as unread'} title={unread ? 'Mark as read' : 'Mark as unread'}
                      className="grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-accent-soft hover:text-ink">
                      {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : <Icon name={unread ? 'mark-read' : 'mark-unread'} size={18} />}
                    </button>
                    <button type="button" onClick={() => remove([n.id])} aria-label="Delete notification" title="Delete"
                      className="grid size-9 place-items-center rounded-full text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"><Icon name="trash" size={18} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {hasMore ? <div className="grid place-items-center"><Button type="button" variant="outline" loading={bulkBusy === 'more'} loadingText="Loading…" autoLoading={false} onClick={loadMore}>Load older</Button></div> : null}
    </div>
  );
}
