-- Behavioural tests: tenant isolation, order flow, commission snapshot, ledger immutability, payouts.
-- Run against a LOCAL/DISPOSABLE database only (it inserts users):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/isolation_and_money.sql
-- Raises an exception on the first failed assertion; prints PASS lines otherwise.
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

-- fixtures
insert into auth.users (id, email) values
 ('a0000000-0000-0000-0000-000000000001','ownerA@x.test'),
 ('c0000000-0000-0000-0000-000000000001','cust@x.test'),
 ('f0000000-0000-0000-0000-000000000001','platform@x.test'),
 ('f0000000-0000-0000-0000-000000000002','support@x.test');
insert into public.platform_staff values ('f0000000-0000-0000-0000-000000000001','admin'),('f0000000-0000-0000-0000-000000000002','support');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.register_kitchen('kitchen-a', 'Kitchen A') as ta \gset
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.set_tenant_status(:'ta', 'active');
select pg_temp.reset();
update public.tenants set contact_email = 'kitchen@a.test' where id = :'ta';

-- ---------- rate limiting ----------
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.register_kitchen('k-extra-1','Extra 1'); select public.register_kitchen('k-extra-2','Extra 2');
select pg_temp.assert(pg_temp.raises($q$select public.register_kitchen('k-extra-3','E3')$q$, 'rate_limited'), 'kitchen registration rate limited (3/day)');

-- ---------- products + customer + order ----------
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
insert into public.products (tenant_id, slug, name, price_minor) values (:'ta','burger','Burger',50000) returning id as pa \gset
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select public.register_kitchen_customer(:'ta', 'Jane', '0708374149');
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":2}]', :'pa')::jsonb, 'pickup') as o1 \gset
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o2 \gset
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') from generate_series(1,6);
select pg_temp.assert(pg_temp.raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]', 'pickup')$q$, :'ta', :'pa'), 'rate_limited'), 'order creation limited per user (8 per 5 min)');
select pg_temp.reset();
delete from public.rate_limits;

-- ---------- notification deliveries ----------
select pg_temp.assert((select count(*) from public.notification_deliveries) = 0, 'no deliveries before any notification');
insert into public.payments (tenant_id, order_id, kitchen_customer_id, amount_minor, currency, msisdn, idempotency_key, status, checkout_request_id)
select tenant_id, id, kitchen_customer_id, total_minor, currency, '254708374149', 'p1', 'STK_SENT', 'ws_CO_1' from public.orders where id = :'o1';
select pg_temp.as_service();
-- status-query confirmation (no receipt): payment is recorded with receipt_pending
select public.record_payment_success('ws_CO_1', null, 100000, '{"src":"query"}');
select pg_temp.reset();
select pg_temp.assert((select receipt_pending from public.payments where checkout_request_id='ws_CO_1') and (select provider_receipt from public.payments where checkout_request_id='ws_CO_1') is null, 'query-confirmed payment has receipt_pending and no fake receipt');
select pg_temp.assert((select status from public.orders where id=:'o1') = 'RECEIVED', 'query-confirmed payment still advances the order');
select pg_temp.assert((select count(*) from public.notification_deliveries where channel='email' and to_address='cust@x.test') >= 1, 'customer email queued for order notifications');
select pg_temp.assert((select count(*) from public.notification_deliveries where channel='email' and to_address='kitchen@a.test') >= 1, 'kitchen email queued for new order');
select pg_temp.assert((select count(*) from public.notification_deliveries where channel='sms') = 0, 'no SMS by default / without advanced_notifications');

-- late genuine callback backfills the receipt
select pg_temp.as_service();
select public.record_payment_success('ws_CO_1', 'RCPT123456', 100000, '{"src":"callback"}');
select pg_temp.reset();
select pg_temp.assert((select provider_receipt from public.payments where checkout_request_id='ws_CO_1') = 'RCPT123456' and not (select receipt_pending from public.payments where checkout_request_id='ws_CO_1'), 'late callback fills in the missing receipt');
select pg_temp.assert((select count(*) from public.ledger_entries where order_id = :'o1') = 2, 'no duplicate ledger entries after late callback');

-- SMS gating: enable SMS, plan without feature -> still none; Advanced plan -> queued
update public.tenant_notification_settings set customer_sms = true where tenant_id = :'ta';
insert into public.tenant_notification_settings (tenant_id, customer_sms) values (:'ta', true) on conflict (tenant_id) do update set customer_sms = true;
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.transition_order(:'o1', 'ACCEPTED');
select pg_temp.reset();
select pg_temp.assert((select count(*) from public.notification_deliveries where channel='sms') = 0, 'SMS not queued on Basic plan even when enabled');
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.change_subscription(:'ta', 'advanced');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.transition_order(:'o1', 'PREPARING');
select pg_temp.reset();
select pg_temp.assert((select count(*) from public.notification_deliveries where channel='sms' and to_address = '0708374149') = 1, 'SMS queued on Advanced plan');
-- worker queue: claim / complete / retry
select pg_temp.as_service();
select count(*) as claimed from public.claim_deliveries(50) \gset
select pg_temp.assert(:claimed >= 3, 'service can claim queued deliveries');
select pg_temp.assert((select count(*) from public.claim_deliveries(50)) = 0, 'claimed deliveries are not handed out twice');
select public.complete_delivery(id, false, 'provider down') from public.notification_deliveries where status = 'sending' limit 1;
select pg_temp.reset();
select pg_temp.assert((select count(*) from public.notification_deliveries where status='queued' and last_error = 'provider down') = 1, 'failed delivery is re-queued with backoff');
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises($q$select * from public.claim_deliveries(5)$q$, 'permission denied'), 'customers cannot claim deliveries');
select pg_temp.assert((select count(*) from public.notification_deliveries) = 0, 'customers cannot read the delivery queue');
select pg_temp.as_user(null);
select pg_temp.assert(pg_temp.raises($q$select * from public.rate_limits$q$, 'permission denied'), 'anon cannot read rate limits');
select pg_temp.assert(pg_temp.raises($q$select * from public.payout_accounts$q$, 'permission denied'), 'anon cannot read payout accounts');

-- ---------- payout accounts + B2C ----------
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.create_payout('%s', 10000, 'mpesa_b2c')$q$, :'ta'), 'no_payout_account'), 'B2C payout needs an approved payout account');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.request_payout_account(:'ta', '0712 345 678', 'Kitchen A Owner') as acct \gset
select pg_temp.assert((select msisdn from public.payout_accounts where id = :'acct') = '254712345678', 'payout phone number normalised');
select pg_temp.assert(pg_temp.raises(format($q$select public.review_payout_account('%s', true)$q$, :'acct'), 'permission_denied'), 'kitchen cannot approve its own payout account');
select pg_temp.as_user('f0000000-0000-0000-0000-000000000002');
select pg_temp.assert(pg_temp.raises(format($q$select public.review_payout_account('%s', true)$q$, :'acct'), 'permission_denied'), 'support role cannot approve payout accounts');
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.review_payout_account(:'acct', true);
-- changing the account requires fresh approval and replaces the old one
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.request_payout_account(:'ta', '0722000111', 'New') as acct2 \gset
select pg_temp.assert((select status from public.payout_accounts where id = :'acct') = 'approved', 'old account stays approved until the new one is reviewed');
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.review_payout_account(:'acct2', false);
select pg_temp.assert((select status from public.payout_accounts where id = :'acct') = 'approved', 'rejected change leaves approved account untouched');

select pg_temp.assert(pg_temp.raises(format($q$select public.create_payout('%s', 12345, 'mpesa_b2c')$q$, :'ta'), 'amount_not_whole_shillings'), 'payout must be whole shillings');
-- balance after o1: 1000.00 - 100.00 commission = 900.00 => 90000
select public.create_payout(:'ta', 50000, 'mpesa_b2c') as po \gset
select public.create_payout(:'ta', 40000, 'manual') as po_manual \gset
select pg_temp.assert(pg_temp.raises(format($q$select public.create_payout('%s', 100)$q$, :'ta'), 'insufficient_balance'), 'pending and processing payouts reserve the balance');
select pg_temp.as_service();
select originator_id as orig from public.begin_b2c_payout(:'po', 'f0000000-0000-0000-0000-000000000001') \gset
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_b2c_payout('%s','f0000000-0000-0000-0000-000000000001')$q$, :'po'), 'payout_not_pending'), 'B2C cannot be sent twice');
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_b2c_payout('%s','f0000000-0000-0000-0000-000000000002')$q$, :'po_manual'), 'permission_denied'), 'support cannot start a B2C payout');
select pg_temp.assert((select destination_msisdn from public.payouts where id = :'po') = '254712345678', 'B2C destination snapshot comes from the approved account');
select public.complete_b2c_payout(:'orig', 'QGH7XYZ123', 50000, '{}');
select public.complete_b2c_payout(:'orig', 'QGH7XYZ123', 50000, '{}');   -- replay
select pg_temp.reset();
select pg_temp.assert((select status from public.payouts where id = :'po') = 'completed' and (select count(*) from public.ledger_entries where payout_id = :'po') = 1, 'B2C success posts exactly one ledger entry (replay safe)');
select pg_temp.assert((select outstanding_minor from public.kitchen_balances where tenant_id = :'ta') = 40000, 'balance reduced by the B2C payout');

-- failure path (free the reserved balance first)
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.cancel_payout(:'po_manual');
select pg_temp.reset();
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.create_payout(:'ta', 10000, 'mpesa_b2c') as po3 \gset
select pg_temp.as_service();
select originator_id as orig3 from public.begin_b2c_payout(:'po3', 'f0000000-0000-0000-0000-000000000001') \gset
select public.fail_b2c_payout(:'orig3', 2001, 'Invalid initiator', '{}');
select pg_temp.reset();
select pg_temp.assert((select status from public.payouts where id = :'po3') = 'failed' and (select count(*) from public.ledger_entries where payout_id = :'po3') = 0, 'failed B2C posts nothing and frees the balance');
-- stuck processing resolved manually
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.create_payout(:'ta', 10000, 'mpesa_b2c') as po4 \gset
select pg_temp.as_service();
select originator_id as orig4 from public.begin_b2c_payout(:'po4', 'f0000000-0000-0000-0000-000000000001') \gset
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.complete_payout(:'po4', 'MANUAL-REF-1');
select pg_temp.reset();
select pg_temp.assert((select status from public.payouts where id = :'po4') = 'completed', 'admin can resolve a stuck processing payout manually');
select pg_temp.as_service();
select public.complete_b2c_payout(:'orig4', 'QLATE12345', 10000, '{}');   -- late result after manual completion: no double ledger
select pg_temp.reset();
select pg_temp.assert((select count(*) from public.ledger_entries where payout_id = :'po4') = 1, 'late B2C result after manual completion does not double-post');

-- ---------- reversal refunds ----------
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":2}]', :'pa')::jsonb, 'pickup') as o3 \gset
select pg_temp.reset();
insert into public.payments (tenant_id, order_id, kitchen_customer_id, amount_minor, currency, msisdn, idempotency_key, status, checkout_request_id)
select tenant_id, id, kitchen_customer_id, total_minor, currency, '254708374149', 'p3', 'STK_SENT', 'ws_CO_3' from public.orders where id = :'o3';
select pg_temp.as_service();
select public.record_payment_success('ws_CO_3', 'RCPT3', 100000, '{}');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.transition_order(:'o3', 'CANCELLED');
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_refund('%s', null, 'a0000000-0000-0000-0000-000000000001')$q$, :'o3'), 'permission denied'), 'users cannot start a reversal directly');
select pg_temp.as_service();
select refund_id as rf from public.begin_refund(:'o3', null, 'f0000000-0000-0000-0000-000000000001') \gset
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_refund('%s', null, 'f0000000-0000-0000-0000-000000000001')$q$, :'o3'), 'refund_in_progress'), 'only one reversal per payment');
select public.attach_reversal_response(:'rf', 'orig-rev-1', 'conv-1');
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.refund_order('%s','manual')$q$, :'o3'), 'refund_in_progress'), 'manual refund blocked while a reversal is in flight');
select pg_temp.as_service();
select public.complete_refund('orig-rev-1', 'REVRCPT01', '{}');
select public.complete_refund('orig-rev-1', 'REVRCPT01', '{}');
select pg_temp.reset();
select pg_temp.assert((select status from public.orders where id = :'o3') = 'REFUNDED' and (select coalesce(sum(amount_minor),0) from public.ledger_entries where order_id = :'o3') = 0, 'reversal success refunds the order and nets the ledger to zero (replay safe)');

-- failed reversal can be retried manually
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o4 \gset
select pg_temp.reset();
insert into public.payments (tenant_id, order_id, kitchen_customer_id, amount_minor, currency, msisdn, idempotency_key, status, checkout_request_id)
select tenant_id, id, kitchen_customer_id, total_minor, currency, '254708374149', 'p4', 'STK_SENT', 'ws_CO_4' from public.orders where id = :'o4';
select pg_temp.as_service();
select public.record_payment_success('ws_CO_4', 'RCPT4', 50000, '{}');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.transition_order(:'o4', 'REJECTED');
select pg_temp.as_service();
select refund_id as rf4 from public.begin_refund(:'o4', null, 'f0000000-0000-0000-0000-000000000001') \gset
select public.attach_reversal_response(:'rf4', 'orig-rev-4', 'conv-4');
select public.fail_refund('orig-rev-4', 2001, 'Reversal not permitted', '{}');
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.refund_order(:'o4', 'MANUAL-REV-4');
select pg_temp.reset();
select pg_temp.assert((select status from public.orders where id = :'o4') = 'REFUNDED', 'after a failed reversal the admin can refund manually');

-- ---------- receipts ----------
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.set_payment_receipt('%s','SHORT')$q$, (select id from public.payments limit 1)), 'invalid_receipt'), 'receipt format validated');
rollback;
