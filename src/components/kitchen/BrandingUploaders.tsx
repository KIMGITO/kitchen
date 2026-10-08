'use client';
import { useRouter } from 'next/navigation';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { createClient } from '@/lib/supabase/client';

type Field = 'logo_url' | 'cover_url' | 'profile_url';

/** Uploads happen in the browser; the DB write is RLS + column-grant protected (settings.manage). */
export function BrandingUploaders({ tenantId, logo, cover, profile }: { tenantId: string; logo: string | null; cover: string | null; profile: string | null }) {
  const router = useRouter();
  const save = (field: Field) => async (url: string) => {
    await createClient().from('tenants').update({ [field]: url }).eq('id', tenantId);
    router.refresh();
  };
  return (
    <div className="grid gap-6 sm:grid-cols-3">
      <ImageUploader tenantId={tenantId} kind="logo" folder="logo" label="Logo" currentUrl={logo} onUploaded={save('logo_url')} />
      <ImageUploader tenantId={tenantId} kind="cover" folder="cover" label="Cover image" currentUrl={cover} onUploaded={save('cover_url')} />
      <ImageUploader tenantId={tenantId} kind="profile" folder="profile" label="Profile image" currentUrl={profile} onUploaded={save('profile_url')} />
    </div>
  );
}
