'use client';
import { useMemo } from 'react';
import { ActionForm } from '@/components/ui/ActionForm';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { Input } from '@/components/ui/Input';
import { saveProduct } from '@/lib/actions/menu';
import { useState } from 'react';

export interface ProductFormValues {
  id?: string; name: string; slug: string; description: string; category_id: string; price: string;
  prep_minutes: string; calories: string; is_available: boolean; image_url: string | null;
}
export function ProductForm({ tenantId, categories, values }: { tenantId: string; categories: { id: string; name: string }[]; values?: ProductFormValues }) {
  const id = useMemo(() => values?.id ?? crypto.randomUUID(), [values?.id]);
  const [image, setImage] = useState<string | null>(values?.image_url ?? null);
  return (
    <ActionForm action={saveProduct} submitLabel={values?.id ? 'Save item' : 'Create item'}>
      <input type="hidden" name="id" value={id} /><input type="hidden" name="image_url" value={image ?? ''} />
      <ImageUploader tenantId={tenantId} kind="product" folder={`products/${id}`} label="Photo" currentUrl={image} onUploaded={(url) => setImage(url)} />
      <Input label="Name" name="name" required maxLength={120} defaultValue={values?.name} />
      <label className="flex flex-col gap-1.5"><span className="text-label">Description</span>
        <textarea name="description" rows={3} maxLength={1000} defaultValue={values?.description} className="rounded-md border border-line bg-surface p-3 text-body" /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Price (KSh)" name="price" inputMode="numeric" required defaultValue={values?.price} hint="Whole shillings, for example 450." />
        <label className="flex flex-col gap-1.5"><span className="text-label">Category</span>
          <select name="category_id" defaultValue={values?.category_id ?? ''} className="h-11 rounded-md border border-line bg-surface px-3">
            <option value="">No category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <Input label="Preparation time (minutes)" name="prep_minutes" inputMode="numeric" defaultValue={values?.prep_minutes} />
        <Input label="Calories" name="calories" inputMode="numeric" defaultValue={values?.calories} />
      </div>
      <Input label="Web address (optional)" name="slug" defaultValue={values?.slug} hint="Used in the item link. Created from the name if left blank." />
      <label className="flex items-center gap-2 text-body"><input type="checkbox" name="is_available" defaultChecked={values?.is_available ?? true} className="size-4 accent-brand" />Available to order</label>
    </ActionForm>
  );
}
