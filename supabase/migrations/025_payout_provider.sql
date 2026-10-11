-- 025: label payouts with the rail that sent them, so payment-reconcile can safely re-query
-- Flutterwave for transfers stuck in `processing` without touching legacy Daraja payouts.
-- `begin_fw_payout` (scheduled worker) is Flutterwave-only and labels itself; the manual admin
-- payout path reuses the shared `begin_b2c_payout`, so `fw-payout` tags it via mark_payout_provider.
-- Existing/legacy rows stay 'mpesa' (the default), which is correct for anything sent through Daraja.
begin;

alter table public.payouts add column if not exists provider text not null default 'mpesa';

-- Scheduled Flutterwave worker: same as 024's begin_fw_payout, plus the provider label.
create or replace function public.begin_fw_payout(p_payout uuid)
returns table (originator_id text, msisdn text, amount_minor bigint, tenant_id uuid, account_name text)
language plpgsql security definer set search_path = '' as $$
declare v_p public.payouts%rowtype; v_acct public.payout_accounts%rowtype; v_orig text;
begin
  select * into v_p from public.payouts where id = p_payout for update;
  if not found then raise exception 'payout_not_found' using errcode = 'P0002'; end if;
  if v_p.method <> 'mpesa_b2c' or v_p.status <> 'pending' then raise exception 'payout_not_pending' using errcode = 'P0001'; end if;
  select * into v_acct from public.payout_accounts a where a.tenant_id = v_p.tenant_id and a.status = 'approved';
  if not found then raise exception 'no_payout_account' using errcode = 'P0001'; end if;
  v_orig := gen_random_uuid()::text;
  update public.payouts set status = 'processing', provider = 'flutterwave', originator_conversation_id = v_orig, destination_msisdn = v_acct.msisdn, sent_at = now() where id = p_payout;
  perform private.write_audit(v_p.tenant_id, 'payout.fw_sent', 'payout', p_payout, jsonb_build_object('msisdn_last4', right(v_acct.msisdn, 4)));
  return query select v_orig, v_acct.msisdn, v_p.amount_minor, v_p.tenant_id, v_acct.account_name;
end $$;

-- Manual Flutterwave payout (fw-payout) uses the shared begin_b2c_payout, so it tags the rail here.
-- Only mpesa/flutterwave are accepted, and only while the payout is still pending/processing.
create or replace function public.mark_payout_provider(p_payout uuid, p_provider text)
returns void language sql security definer set search_path = '' as $$
  update public.payouts set provider = p_provider
   where id = p_payout and p_provider in ('mpesa','flutterwave') and status in ('pending','processing');
$$;

revoke all on function public.begin_fw_payout(uuid) from public, anon, authenticated;
grant execute on function public.begin_fw_payout(uuid) to service_role;
revoke all on function public.mark_payout_provider(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_payout_provider(uuid, text) to service_role;

commit;
