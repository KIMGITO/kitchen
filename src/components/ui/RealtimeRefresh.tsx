'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Subscribes to Postgres changes and re-renders the server component tree when they arrive.
 * Realtime respects RLS: the browser only receives rows it is allowed to select.
 */
export function RealtimeRefresh({ table, filter, channel }: { table: string; filter: string; channel: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(channel)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => router.refresh(), 250);
      })
      .subscribe();
    return () => { if (timer.current) clearTimeout(timer.current); void supabase.removeChannel(ch); };
  }, [table, filter, channel, router]);
  return null;
}
