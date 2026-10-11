-- Flutterwave provider flow: hosted checkout -> verified success/failure -> ledger, refund, payout (manual + automatic).
-- Run against a LOCAL/DISPOSABLE database only (it inserts users), after all migrations:
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/flutterwave.sql
-- Raises on the first failed assertion; prints PASS lines otherwise.
begin;

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', p)::text, true);
  execute 'set local role ' || case when p is null then 'anon' else 'authenticated' end;
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role service_role';
end $$;
create or replace function pg_temp.reset() returns void language plpgsql as $$
begin execute 'reset role'; end $$;
create or replace function pg_temp.assert(cond boolean, msg text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;
create or replace function pg_temp.raises(stmt text, expected text) returns boolean language plpgsql as $$
begin execute stmt; return false;
exception when others then return position(expected in sqlerrm) > 0 or sqlstate = expected; end $$;

-- ---------- fixtures ----------
insert into auth.users (id, email) values
 ('a0000000-0000-0000-0000-000000000001','ownerA@x.test'),
 ('c0000000-0000-0000-0000-000000000001','cust@x.test'),
 ('f0000000-0000-0000-0000-000000000001','platform@x.test');
insert into public.platform_staff values ('f0000000-0000-0000-0000-000000000001','admin');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.register_kitchen('kitchen-a', 'Kitchen A') as ta \gset
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.set_tenant_status(:'ta', 'active');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
insert into public.products (tenant_id, slug, name, price_minor) values (:'ta','burger','Burger',50000) returning id as pa \gset
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select public.register_kitchen_customer(:'ta', 'Jane', '0712345678');
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o1 \gset
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o2 \gset
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o3 \gset
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o4 \gset

-- phone rules: stored as +254..., invalid numbers rejected
select pg_temp.assert((select contact_phone from public.orders where id = :'o1') = '+254712345678', 'order contact phone stored as +254 E.164');
select pg_temp.assert(pg_temp.raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]'::jsonb, 'pickup', null, 'Jane', '12345')$q$, :'ta', :'pa'), 'invalid_phone'), 'order with an invalid phone number is rejected');

-- ---------- hosted checkout ----------
select pg_temp.assert(pg_temp.raises(format($q$select public.attach_checkout('%s', 'x', 'y')$q$, :'o1'), 'permission denied'), 'customers cannot attach a checkout');
select pg_temp.assert(pg_temp.raises($q$select * from public.run_auto_payouts(false)$q$, 'permission denied'), 'customers cannot run payouts');
select pg_temp.as_user(null);
select pg_temp.assert(pg_temp.raises($q$select public.record_payment_success('fw_x', 'r', 1, '{}')$q$, 'permission denied'), 'anon cannot record a payment');

select pg_temp.as_service();
select pay_id as p1 from public.begin_payment(:'o1', 'c0000000-0000-0000-0000-000000000001', '254712345678', 'fw-idem-1') \gset
select public.attach_checkout(:'p1', 'fw_' || :'p1', 'https://checkout.flutterwave.test/pay/1');
select pg_temp.assert((select provider = 'flutterwave' and status = 'STK_SENT' and checkout_request_id = 'fw_' || :'p1' and checkout_url is not null from public.payments where id = :'p1'), 'attach_checkout labels the payment Flutterwave and stores tx_ref + link');
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_payment('%s','c0000000-0000-0000-0000-000000000001','254712345678','fw-idem-x')$q$, :'o1'), 'payment_in_progress'), 'a second concurrent checkout is blocked');

-- success (as the webhook records it after verifying with Flutterwave)
select public.record_payment_success('fw_' || :'p1', 'FLW-REF-1', 50000, '{"source":"flutterwave","provider_tx_id":"777"}');
select pg_temp.reset();
select pg_temp.assert((select status = 'SUCCEEDED' and provider_tx_id = '777' and provider_receipt = 'FLW-REF-1' and not receipt_pending from public.payments where id = :'p1'), 'success stores status, Flutterwave tx id and receipt');
select pg_temp.assert((select status from public.orders where id = :'o1') = 'RECEIVED', 'successful payment moves the order to RECEIVED');
select pg_temp.assert((select coalesce(sum(amount_minor),0) from public.ledger_entries where order_id = :'o1') = (select kitchen_net_minor from public.orders where id = :'o1')
  and (select kitchen_net_minor + commission_minor from public.orders where id = :'o1') = 50000, 'ledger nets to kitchen share; kitchen share + commission = total');
select pg_temp.assert(exists (select 1 from public.payment_events where provider = 'flutterwave' and external_id = 'fw_' || :'p1' and event_type = 'callback_success'), 'event recorded under provider flutterwave');
select pg_temp.assert(exists (select 1 from public.notifications where kind = 'order.paid' and data ->> 'order_id' = :'o1' and body like '%FLW-REF-1%'), 'receipt notification carries the Flutterwave reference');

-- replay / double delivery is a no-op
select pg_temp.as_service();
select public.record_payment_success('fw_' || :'p1', 'FLW-REF-1', 50000, '{"source":"flutterwave","provider_tx_id":"777"}');
select pg_temp.reset();
select pg_temp.assert((select count(*) from public.ledger_entries where order_id = :'o1') = (select case when commission_minor > 0 then 2 else 1 end from public.orders where id = :'o1'), 'replayed webhook does not duplicate ledger entries');

-- wrong amount: flagged for refund, order NOT advanced, no ledger entries
select pg_temp.as_service();
select pay_id as p2 from public.begin_payment(:'o2', 'c0000000-0000-0000-0000-000000000001', '254712345678', 'fw-idem-2') \gset
select public.attach_checkout(:'p2', 'fw_' || :'p2', 'https://checkout.flutterwave.test/pay/2');
select public.record_payment_success('fw_' || :'p2', 'FLW-REF-2', 45000, '{"provider_tx_id":"778"}');
select pg_temp.reset();
select pg_temp.assert((select status = 'FAILED' and needs_refund and result_desc = 'amount_mismatch' from public.payments where id = :'p2'), 'short payment is flagged amount_mismatch + needs_refund');
select pg_temp.assert((select status from public.orders where id = :'o2') = 'PENDING_PAYMENT' and not exists (select 1 from public.ledger_entries where order_id = :'o2'), 'short payment does not advance the order or touch the ledger');

-- failure, replay, then retry
select pg_temp.as_service();
select pay_id as p3 from public.begin_payment(:'o3', 'c0000000-0000-0000-0000-000000000001', '254712345678', 'fw-idem-3') \gset
select public.attach_checkout(:'p3', 'fw_' || :'p3', 'https://checkout.flutterwave.test/pay/3');
select public.record_payment_failure('fw_' || :'p3', 'FAILED', null, 'Insufficient funds', '{}');
select public.record_payment_failure('fw_' || :'p3', 'FAILED', null, 'dup', '{}');
select pg_temp.reset();
select pg_temp.assert((select status = 'FAILED' and result_desc = 'Insufficient funds' from public.payments where id = :'p3') and (select status from public.orders where id = :'o3') = 'PAYMENT_FAILED', 'declined charge fails the payment and order, replay is a no-op');
select pg_temp.as_service();
select pg_temp.assert((select count(*) from public.begin_payment(:'o3', 'c0000000-0000-0000-0000-000000000001', '254712345678', 'fw-idem-3b')) = 1, 'customer can retry after a declined charge');
select pg_temp.reset();

-- ---------- refund through Flutterwave ----------
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.transition_order(:'o1', 'CANCELLED');
select pg_temp.as_service();
select refund_id as rf from public.begin_refund(:'o1', null, 'f0000000-0000-0000-0000-000000000001') \gset
select public.mark_refund_provider(:'rf', 'flutterwave');
select public.attach_reversal_response(:'rf', 'fwr_9001', '9001');
select public.complete_refund('fwr_9001', 'fwr_9001', '{"source":"flutterwave"}');
select pg_temp.reset();
select pg_temp.assert((select status = 'completed' and method = 'flutterwave' from public.refunds where id = :'rf'), 'refund completes with method flutterwave');
select pg_temp.assert((select status from public.orders where id = :'o1') = 'REFUNDED' and (select coalesce(sum(amount_minor),0) from public.ledger_entries where order_id = :'o1') = 0, 'refund nets the order to zero');

-- ---------- payouts through Flutterwave Transfers ----------
select pg_temp.as_service();
select pay_id as p4 from public.begin_payment(:'o4', 'c0000000-0000-0000-0000-000000000001', '254712345678', 'fw-idem-4') \gset
select public.attach_checkout(:'p4', 'fw_' || :'p4', 'https://checkout.flutterwave.test/pay/4');
select public.record_payment_success('fw_' || :'p4', 'FLW-REF-4', 50000, '{"provider_tx_id":"780"}');
select pg_temp.assert((select count(*) from public.run_auto_payouts(false)) = 0, 'automatic payouts are off by default');
select pg_temp.reset();

update public.platform_settings set value = 'true'::jsonb where key = 'auto_payouts_enabled';
select pg_temp.as_service();
select pg_temp.assert((select count(*) from public.run_auto_payouts(false)) = 0, 'no payout without an approved payout account');
select pg_temp.reset();
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.request_payout_account(:'ta', '0712 345 678', 'Kitchen A Owner') as acct \gset
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.review_payout_account(:'acct', true);
select pg_temp.reset();

update public.platform_settings set value = '100000000'::jsonb where key = 'min_payout_minor';
select pg_temp.as_service();
select pg_temp.assert((select count(*) from public.run_auto_payouts(false)) = 0, 'below the minimum: nothing is paid out');
select pg_temp.reset();
update public.platform_settings set value = '1000'::jsonb where key = 'min_payout_minor';
select pg_temp.as_service();
select o_payout_id as po, o_amount_minor as pamt from public.run_auto_payouts(false) \gset
select pg_temp.assert(:pamt = ((select kitchen_net_minor from public.orders where id = :'o4') / 100) * 100 and :pamt > 0, 'payout created for the kitchen balance, rounded to whole shillings');
select pg_temp.assert((select count(*) from public.run_auto_payouts(false)) = 0, 'a pending payout is not paid twice');
select originator_id as orig, msisdn as dest, account_name as nm from public.begin_fw_payout(:'po') \gset
select pg_temp.assert(:'dest' = '254712345678' and :'nm' = 'Kitchen A Owner', 'transfer goes to the APPROVED number and holder name');
select pg_temp.assert((select provider from public.payouts where id = :'po') = 'flutterwave', 'scheduled Flutterwave payout is labelled provider=flutterwave');
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_fw_payout('%s')$q$, :'po'), 'payout_not_pending'), 'a processing payout cannot be started again');
select public.complete_b2c_payout(:'orig', 'TRF-1', :pamt, '{"source":"flutterwave"}');
select public.complete_b2c_payout(:'orig', 'TRF-1', :pamt, '{"source":"flutterwave"}');   -- webhook redelivery
select pg_temp.reset();
select pg_temp.assert((select status from public.payouts where id = :'po') = 'completed' and (select count(*) from public.ledger_entries where payout_id = :'po') = 1, 'completed transfer posts exactly one ledger payout entry');
select pg_temp.assert((select coalesce(sum(amount_minor),0) from public.ledger_entries where tenant_id = :'ta') < 100, 'kitchen balance is paid out (only sub-shilling remainder left)');

-- ---------- provider labelling for payment-reconcile (025) ----------
-- The manual admin path reuses begin_b2c_payout (no provider set), so fw-payout tags it via mark_payout_provider.
-- Legacy/Daraja rows keep the 'mpesa' default, so reconcile only ever re-queries Flutterwave transfers.
select pg_temp.as_service();
insert into public.payouts (tenant_id, amount_minor, currency, method, note)
  values (:'ta', 20000, 'KES', 'mpesa_b2c', 'manual') returning id as pman \gset
select pg_temp.assert((select provider from public.payouts where id = :'pman') = 'mpesa', 'a new payout defaults to provider=mpesa (Daraja/manual)');
select public.mark_payout_provider(:'pman', 'flutterwave');
select pg_temp.reset();
select pg_temp.assert((select provider from public.payouts where id = :'pman') = 'flutterwave', 'mark_payout_provider tags a manual Flutterwave payout');
-- Unknown provider values are ignored, and completed/failed payouts cannot be re-tagged.
select pg_temp.as_service();
select public.mark_payout_provider(:'pman', 'paypal');
select public.mark_payout_provider(:'po', 'flutterwave');   -- :po is already completed
select pg_temp.reset();
select pg_temp.assert((select provider from public.payouts where id = :'pman') = 'flutterwave', 'an invalid provider value leaves the label unchanged');
rollback;
