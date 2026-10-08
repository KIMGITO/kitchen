-- 009: payouts (kitchen settlements). Money moves in the ledger only when a payout completes.
create type public.payout_status as enum ('pending','completed','failed','cancelled');

create table public.payouts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  amount_minor  bigint not null check (amount_minor > 0),
  currency      char(3) not null,
  status        public.payout_status not null default 'pending',
  method        text not null default 'manual' check (method in ('manual','mpesa_b2c','bank')),
  reference     text,
  note          text,
  created_by    uuid references auth.users(id),
  completed_by  uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz,
  updated_at    timestamptz not null default now()
);
create index payouts_tenant_created on public.payouts (tenant_id, created_at desc);
create trigger payouts_updated_at before update on public.payouts
  for each row execute function private.set_updated_at();

alter table public.ledger_entries
  add constraint ledger_payout_fk foreign key (payout_id) references public.payouts(id);
create unique index ledger_one_entry_per_payout on public.ledger_entries (payout_id) where entry_type = 'payout';

create or replace function public.create_payout(p_tenant uuid, p_amount_minor bigint, p_method text default 'manual', p_note text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_out bigint; v_pending bigint; v_cur char(3); v_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  perform 1 from public.tenants where id = p_tenant for update;      -- serialise payouts per kitchen
  select currency into v_cur from public.tenants where id = p_tenant;
  select coalesce(sum(amount_minor),0) into v_out from public.ledger_entries where tenant_id = p_tenant;
  select coalesce(sum(amount_minor),0) into v_pending from public.payouts where tenant_id = p_tenant and status = 'pending';
  if p_amount_minor > v_out - v_pending then
    raise exception 'insufficient_balance' using errcode = 'P0001'; end if;
  insert into public.payouts (tenant_id, amount_minor, currency, method, note, created_by)
  values (p_tenant, p_amount_minor, v_cur, p_method, p_note, auth.uid()) returning id into v_id;
  perform private.write_audit(p_tenant, 'payout.created', 'payout', v_id, jsonb_build_object('amount_minor', p_amount_minor));
  return v_id;
end $$;

create or replace function public.complete_payout(p_payout uuid, p_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_p from public.payouts where id = p_payout for update;
  if not found then raise exception 'payout_not_found' using errcode = 'P0002'; end if;
  if v_p.status <> 'pending' then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  update public.payouts set status = 'completed', reference = p_reference,
         completed_by = auth.uid(), completed_at = now() where id = p_payout;
  insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, payout_id, description, created_by)
  values (v_p.tenant_id, 'payout', -v_p.amount_minor, v_p.currency, v_p.id, 'Payout to kitchen', auth.uid());
  perform private.write_audit(v_p.tenant_id, 'payout.completed', 'payout', p_payout, jsonb_build_object('reference', p_reference));
end $$;

create or replace function public.cancel_payout(p_payout uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype;
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  select * into v_p from public.payouts where id = p_payout for update;
  if not found or v_p.status <> 'pending' then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  update public.payouts set status = 'cancelled' where id = p_payout;
  perform private.write_audit(v_p.tenant_id, 'payout.cancelled', 'payout', p_payout, '{}'::jsonb);
end $$;

revoke all on function public.create_payout(uuid, bigint, text, text) from public;
revoke all on function public.complete_payout(uuid, text) from public;
revoke all on function public.cancel_payout(uuid) from public;
grant execute on function public.create_payout(uuid, bigint, text, text) to authenticated;
grant execute on function public.complete_payout(uuid, text) to authenticated;
grant execute on function public.cancel_payout(uuid) to authenticated;

-- Manual ledger adjustment (platform admin), always with a reason.
create or replace function public.post_adjustment(p_tenant uuid, p_amount_minor bigint, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_cur char(3);
begin
  if not private.is_platform_admin() then raise exception 'permission_denied' using errcode = '42501'; end if;
  if p_amount_minor = 0 or length(coalesce(trim(p_reason), '')) < 3 then
    raise exception 'invalid_adjustment' using errcode = 'P0001'; end if;
  select currency into v_cur from public.tenants where id = p_tenant;
  insert into public.ledger_entries (tenant_id, entry_type, amount_minor, currency, description, created_by)
  values (p_tenant, 'adjustment', p_amount_minor, v_cur, p_reason, auth.uid());
  perform private.write_audit(p_tenant, 'ledger.adjustment', 'tenant', p_tenant,
          jsonb_build_object('amount_minor', p_amount_minor, 'reason', p_reason));
end $$;
revoke all on function public.post_adjustment(uuid, bigint, text) from public;
grant execute on function public.post_adjustment(uuid, bigint, text) to authenticated;
