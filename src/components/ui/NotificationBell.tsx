'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from './primitives/Icon';
import { cn } from './cn';
import { Badge } from './primitives/Badge';

interface N { id: string; title: string; kind: string; data: { order_id?: string }; read_at: string | null; created_at: string; audience: 'customer' | 'kitchen' }

export function NotificationBell({ tenantId, audience }: { tenantId: string; audience: 'customer' | 'kitchen' }) {
  const [items, setItems] = useState<N[]>([]);
  const href = (n: N) => (n.data.order_id ? (audience === 'customer' ? `/orders/${n.data.order_id}` : '/dashboard/orders') : '#');

  const load = useCallback(async () => {
    const { data } = await createClient().from('notifications').select('id, title, kind, data, read_at, created_at, audience')
      .eq('tenant_id', tenantId).eq('audience', audience).order('created_at', { ascending: false }).limit(15);
    setItems((data ?? []) as N[]);
  }, [tenantId, audience]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const ch = supabase.channel(`notifications:${tenantId}:${audience}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `tenant_id=eq.${tenantId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load, tenantId, audience]);

  const unread = items.filter((i) => !i.read_at);
  async function markRead() {
    if (unread.length === 0) return;
    await createClient().rpc('mark_notifications_read', { p_tenant: tenantId, p_ids: unread.map((u) => u.id) });
    void load();
  }

  return (
    <details className="relative" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void markRead(); }}>
      <summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-pill px-3 text-label text-inherit hover:bg-white/10 transition-colors outline-none" aria-label={`Notifications, ${unread.length} unread`}>
        <Icon name="bell" size={16} />
        <span className="hidden sm:inline">Alerts</span>
        {unread.length > 0 ? <Badge tone="promo">{unread.length}</Badge> : null}
      </summary>
      <div className="absolute right-0 z-40 mt-2 w-80 max-w-[85vw] rounded-lg border border-line bg-surface p-2 text-ink shadow-raised">
        {items.length === 0 ? <p className="p-3 text-caption text-ink-soft">No notifications yet.</p> : (
          <ul>{items.map((n) => (
            <li key={n.id}><Link href={href(n)} className={cn('block rounded-md p-3 transition-colors', n.read_at ? 'hover:bg-surface' : 'font-semibold hover:bg-surface')}>
              <span className={cn('text-body', n.read_at ? 'text-ink-muted' : 'text-ink-muted')}>{n.title}</span>
              <span className="block text-caption text-ink-soft">{new Date(n.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </Link></li>))}
          </ul>)}
      </div>
    </details>
  );
}
