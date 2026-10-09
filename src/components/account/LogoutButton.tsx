'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

export function LogoutButton({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm" loading={busy} loadingText="Logging out…" autoLoading={false}
      onClick={async () => { setBusy(true); try { await createClient().auth.signOut(); router.replace(redirectTo); router.refresh(); } finally { setBusy(false); } }}>
      Log out
    </Button>
  );
}
