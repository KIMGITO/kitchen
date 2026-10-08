'use client';
import { useMemo, useState } from 'react';
import { ActionForm } from '@/components/ui/ActionForm';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Input } from '@/components/ui/Input';
import { savePromotion } from '@/lib/actions/promotions';

export function PromotionForm({ tenantId, products }: { tenantId: string; products: { id: string; name: string }[] }) {
  const id = useMemo(() => crypto.randomUUID(), []);
  const [image, setImage] = useState<string | null>(null);
  return (
    <ActionForm action={savePromotion} submitLabel="Publish promotion">
      <input type="hidden" name="image_url" value={image ?? ''} />
      <ImageUploader tenantId={tenantId} kind="promo" folder={`promos/${id}`} label="Ad image (wide photo works best)" currentUrl={image} onUploaded={(url) => setImage(url)} />
      <Input label="Headline" name="title" required maxLength={80} placeholder="Weekend feast: 2 burgers + fries" />
      <Input label="Short description (optional)" name="subtitle" maxLength={140} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Discount % (optional)" name="discount" inputMode="numeric" placeholder="20" />
        <Input label="Ends on (optional)" name="ends_on" type="date" />
        <label className="flex flex-col gap-1.5"><span className="field-label">Links to item (optional)</span>
          <select name="product_id" defaultValue="" className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink-muted">
            <option value="">Whole menu</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
      </div>
    </ActionForm>
  );
}
