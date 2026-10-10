'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Icon } from './primitives/Icon';

export const NOTIFICATIONS_CHANGED = 'notifications:changed';

/** Header link to the notifications page, with a live unread count (Realtime + instant updates from the page itself). */
export function NotificationBell({ tenantId, audience }: { tenantId: string; audience: 'customer' | 'kitchen' }) {
  const [count, setCount] = useState(0);
  const href = audience === 'customer' ? '/notifications' : '/dashboard/notifications';

  const load = useCallback(async () => {
    const { count: c } = await createClient().from('notifications').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('audience', audience).is('read_at', null);
    setCount(c ?? 0);
  }, [tenantId, audience]);

  useEffect(() => {
    void load();
    const supabase = createClient();
    const ch = supabase.channel(`bell:${tenantId}:${audience}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `tenant_id=eq.${tenantId}` }, () => void load())
      .subscribe();
    const onChange = () => void load();
    window.addEventListener(NOTIFICATIONS_CHANGED, onChange);
    return () => { window.removeEventListener(NOTIFICATIONS_CHANGED, onChange); void supabase.removeChannel(ch); };
  }, [load, tenantId, audience]);

  return (
    <Link href={href} aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
      className="relative flex h-10 items-center gap-2 rounded-pill px-3 text-label text-inherit outline-none transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent">
      <Icon name={count > 0 ? 'bell-ringing' : 'bell'} size={20} />
      <span className="hidden sm:inline">Alerts</span>
      {count > 0 ? (
        <span key={count} className="animate-pop grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-caption font-semibold text-accent-contrast">{count > 99 ? '99+' : count}</span>
      ) : null}
    </Link>
  );
}
