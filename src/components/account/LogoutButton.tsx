'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';

export function LogoutButton({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter();
  return (
    <Button type="button" variant="outline" size="sm" onClick={async () => { await createClient().auth.signOut(); router.replace(redirectTo); router.refresh(); }}>
      Log out
    </Button>
  );
}
