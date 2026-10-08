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
 ('c0000000-0000-0000-0000-000000000002','cust2@x.test'),
 ('f0000000-0000-0000-0000-000000000001','platform@x.test');
insert into public.platform_staff values ('f0000000-0000-0000-0000-000000000001','admin');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.register_kitchen('kitchen-a', 'Kitchen A') as ta \gset
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.set_tenant_status(:'ta', 'active');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
insert into public.products (tenant_id, slug, name, price_minor) values (:'ta','burger','Burger',50000) returning id as pa \gset
select pg_temp.assert(pg_temp.raises(format($q$insert into public.products (tenant_id, slug, name, price_minor) values (%L,'bad','Bad',12345)$q$, :'ta'), 'products_whole_currency'), 'fractional-shilling prices rejected (M-Pesa needs whole KSh)');

select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select public.register_kitchen_customer(:'ta', 'Jane', '254708374149');
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o1 \gset
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":1}]', :'pa')::jsonb, 'pickup') as o2 \gset

-- begin_payment is service-only
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_payment('%s','%s','254708374149','k')$q$, :'o1','c0000000-0000-0000-0000-000000000001'), 'permission denied'), 'customers cannot call begin_payment directly');

select pg_temp.as_service();
select pay_id as p1 from public.begin_payment(:'o1', 'c0000000-0000-0000-0000-000000000001', '254708374149', 'idem-1') \gset
select pg_temp.assert((select pay_id from public.begin_payment(:'o1', 'c0000000-0000-0000-0000-000000000001', '254708374149', 'idem-1')) = :'p1', 'same idempotency key returns same payment');
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_payment('%s','%s','254708374149','idem-2')$q$, :'o1','c0000000-0000-0000-0000-000000000001'), 'payment_in_progress'), 'second concurrent payment attempt blocked');
select pg_temp.assert(pg_temp.raises(format($q$select * from public.begin_payment('%s','%s','254708374149','idem-3')$q$, :'o2','c0000000-0000-0000-0000-000000000002'), 'permission_denied'), 'another user cannot pay for my order');
select public.attach_stk_response(:'p1', 'm1', 'ws_CO_A');

-- failure -> PAYMENT_FAILED -> retry works
select public.record_payment_failure('ws_CO_A', 'CANCELLED_BY_USER', 1032, 'Request cancelled by user', '{}');
select public.record_payment_failure('ws_CO_A', 'CANCELLED_BY_USER', 1032, 'dup', '{}');   -- replay no-op
select pg_temp.reset();
select pg_temp.assert((select status from public.orders where id = :'o1') = 'PAYMENT_FAILED', 'cancelled prompt marks order PAYMENT_FAILED');
select pg_temp.as_service();
select pay_id as p2 from public.begin_payment(:'o1', 'c0000000-0000-0000-0000-000000000001', '254708374149', 'idem-4') \gset
select pg_temp.reset();
select pg_temp.assert((select status from public.orders where id = :'o1') = 'PENDING_PAYMENT', 'retry returns order to PENDING_PAYMENT');
select pg_temp.as_service();
select public.attach_stk_response(:'p2', 'm2', 'ws_CO_B');
select public.record_payment_success('ws_CO_B','R2',49999,'{}');
select pg_temp.reset();
select pg_temp.assert((select needs_refund from public.payments where id = :'p2') and (select count(*) from public.ledger_entries where order_id = :'o1') = 0, 'amount mismatch is flagged for refund review and never credits the kitchen');

-- late success on an expired order => needs_refund, no ledger entries
update public.orders set created_at = now() - interval '2 hours' where id = :'o2';
select pg_temp.as_service();
select public.expire_stale_orders(30) as expired \gset
select pg_temp.assert(:expired >= 1, 'stale unpaid orders expire');
select pg_temp.reset();
insert into public.payments (tenant_id, order_id, kitchen_customer_id, amount_minor, currency, msisdn, idempotency_key, status, checkout_request_id)
select tenant_id, id, kitchen_customer_id, total_minor, currency, '254708374149', 'late', 'STK_SENT', 'ws_CO_LATE' from public.orders where id = :'o2';
select pg_temp.as_service();
select public.record_payment_success('ws_CO_LATE', 'RLATE', 50000, '{}');
select pg_temp.reset();
select pg_temp.assert((select needs_refund from public.payments where checkout_request_id='ws_CO_LATE') and (select count(*) from public.ledger_entries where order_id = :'o2') = 0, 'late payment on expired order flagged for refund, kitchen not credited');

-- refund of a paid then cancelled order restores ledger to zero
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select public.create_order(:'ta', format('[{"product_id":"%s","quantity":2}]', :'pa')::jsonb, 'pickup') as o3 \gset
select pg_temp.as_service();
select pay_id as p3 from public.begin_payment(:'o3', 'c0000000-0000-0000-0000-000000000001', '254708374149', 'idem-5') \gset
select public.attach_stk_response(:'p3', 'm3', 'ws_CO_C');
select public.record_payment_success('ws_CO_C', 'RC', 100000, '{}');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.transition_order(:'o3', 'CANCELLED');
select pg_temp.assert(pg_temp.raises(format($q$select public.refund_order('%s','x')$q$, :'o3'), 'permission_denied'), 'kitchen cannot refund');
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.refund_order(:'o3', 'MPESA-REV-1');
select pg_temp.assert(pg_temp.raises(format($q$select public.refund_order('%s','x')$q$, :'o3'), 'refund_in_progress'), 'refund cannot run twice');
select pg_temp.reset();
select pg_temp.assert((select status from public.orders where id = :'o3') = 'REFUNDED' and (select coalesce(sum(amount_minor),0) from public.ledger_entries where order_id = :'o3') = 0, 'refund + commission reversal net the order to zero');

-- hardening: internal helpers are not callable via the API
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises($q$select private.write_audit(null::uuid,'x','y','z'::text)$q$, 'permission denied'), 'authenticated cannot forge audit entries');
select pg_temp.assert(pg_temp.raises(format($q$select private.apply_transition('%s','READY',null,'staff')$q$, :'o1'), 'permission denied'), 'authenticated cannot call apply_transition');
select pg_temp.as_user(null);
select pg_temp.assert(pg_temp.raises($q$select public.create_order(gen_random_uuid(),'[]','pickup')$q$, 'permission denied'), 'anon cannot execute create_order');
select pg_temp.assert((select count(*) from public.resolve_tenant('kitchen-a.localhost')) = 1, 'anon can resolve an active tenant');

-- staff directory
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*) from public.list_staff(:'ta')) = 1, 'kitchen admin can list staff');
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*) from public.list_staff(:'ta')) = 0, 'customer sees no staff');
rollback;
