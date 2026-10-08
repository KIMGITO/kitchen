-- 011: storage buckets with server-enforced limits, and tenant-scoped policies
-- Object path convention: {tenant_id}/... (first segment is ALWAYS the tenant id)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('kitchen-branding',  'kitchen-branding',  true,  5242880,  array['image/webp','image/jpeg','image/png']),
  ('product-images',    'product-images',    true,  2097152,  array['image/webp','image/jpeg','image/png']),
  ('promo-images',      'promo-images',      true,  3145728,  array['image/webp','image/jpeg','image/png']),
  ('kitchen-documents', 'kitchen-documents', false, 10485760, array['application/pdf','image/webp','image/jpeg','image/png']),
  ('customer-avatars',  'customer-avatars',  false, 1048576,  array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types, public = excluded.public;

-- Public buckets: reads happen through public URLs. Writes require a tenant permission.
create policy "branding write" on storage.objects for insert to authenticated
  with check (bucket_id = 'kitchen-branding' and private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'settings.manage'));
create policy "branding update" on storage.objects for update to authenticated
  using (bucket_id = 'kitchen-branding' and private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'settings.manage'));
create policy "branding delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kitchen-branding' and private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'settings.manage'));

create policy "product images write" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images','promo-images') and private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'menu.manage'));
create policy "product images update" on storage.objects for update to authenticated
  using (bucket_id in ('product-images','promo-images') and private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'menu.manage'));
create policy "product images delete" on storage.objects for delete to authenticated
  using (bucket_id in ('product-images','promo-images') and private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'menu.manage'));

-- Private documents: kitchen admins + platform staff only.
create policy "documents rw" on storage.objects for all to authenticated
  using (bucket_id = 'kitchen-documents' and (private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'settings.manage') or private.is_platform_staff()))
  with check (bucket_id = 'kitchen-documents' and private.has_permission(private.try_uuid((storage.foldername(name))[1]), 'settings.manage'));

-- Customer avatars: path {tenant_id}/{kitchen_customer_id}/file, owner only.
create policy "avatars owner rw" on storage.objects for all to authenticated
  using (bucket_id = 'customer-avatars' and exists (
    select 1 from public.kitchen_customers kc
    where kc.user_id = auth.uid()
      and kc.tenant_id = private.try_uuid((storage.foldername(name))[1])
      and kc.id = private.try_uuid((storage.foldername(name))[2])))
  with check (bucket_id = 'customer-avatars' and exists (
    select 1 from public.kitchen_customers kc
    where kc.user_id = auth.uid()
      and kc.tenant_id = private.try_uuid((storage.foldername(name))[1])
      and kc.id = private.try_uuid((storage.foldername(name))[2])));
