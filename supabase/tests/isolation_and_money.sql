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

-- fixtures (superuser)
insert into auth.users (id, email) values
 ('a0000000-0000-0000-0000-000000000001','ownerA@x.test'),
 ('b0000000-0000-0000-0000-000000000001','ownerB@x.test'),
 ('c0000000-0000-0000-0000-000000000001','cust@x.test'),
 ('f0000000-0000-0000-0000-000000000001','platform@x.test'),
 ('d0000000-0000-0000-0000-000000000001','worker@x.test');
insert into public.platform_staff values ('f0000000-0000-0000-0000-000000000001','admin');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select public.register_kitchen('kitchen-a', 'Kitchen A') as ta \gset
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select public.register_kitchen('kitchen-b', 'Kitchen B') as tb \gset
select pg_temp.assert(pg_temp.raises($q$select public.register_kitchen('admin','X')$q$, 'reserved_slug'), 'reserved slug blocked');

select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.set_tenant_status(:'ta', 'active'); select public.set_tenant_status(:'tb', 'active');

-- catalog as owner A; owner B cannot write to A
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
insert into public.products (tenant_id, slug, name, price_minor) values (:'ta','burger','Burger',50000) returning id as pa \gset
insert into public.product_option_groups (tenant_id, product_id, name, min_select, max_select) values (:'ta', :'pa', 'Extras', 0, 2) returning id as ga \gset
insert into public.product_options (tenant_id, group_id, name, price_delta_minor) values (:'ta', :'ga', 'Cheese', 10000) returning id as oa \gset
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$insert into public.products (tenant_id, slug, name, price_minor) values (%L,'x','x',1)$q$, :'ta'), 'row-level security'), 'owner B cannot insert product into kitchen A');
insert into public.products (tenant_id, slug, name, price_minor) values (:'tb','soup','Soup',30000) returning id as pb \gset
select pg_temp.assert((select count(*) from public.products where tenant_id = :'ta') = 1 and (select count(*) from public.products where name='Burger') = 1, 'public catalog visible (active tenants)');

-- customer registers with A only
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]', 'pickup')$q$, :'ta', :'pa'), 'no_customer_account'), 'cannot order without kitchen customer account');
select public.register_kitchen_customer(:'ta', 'Jane Doe', '254700000000');
select pg_temp.assert((select count(*) from public.kitchen_customers) = 1, 'customer sees only own customer row');
select pg_temp.assert(pg_temp.raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]', 'pickup')$q$, :'ta', :'pb'), 'product_unavailable'), 'cannot put kitchen B product into kitchen A order');
select pg_temp.assert(pg_temp.raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]', 'pickup')$q$, :'tb', :'pb'), 'no_customer_account'), 'customer of A cannot order from B');

select public.create_order(:'ta', format('[{"product_id":"%s","quantity":2,"option_ids":["%s"]}]', :'pa', :'oa')::jsonb, 'pickup') as ord \gset
select pg_temp.assert((select total_minor from public.orders where id = :'ord') = 120000, 'server computes total (2 x (500+100) = 1200.00)');
select pg_temp.assert(pg_temp.raises(format($q$update public.orders set total_minor = 1 where id = '%s'$q$, :'ord'), 'permission denied'), 'customer cannot update orders directly');

-- isolation: B staff cannot see A orders / customers
select pg_temp.as_user('b0000000-0000-0000-0000-000000000001');
select pg_temp.assert((select count(*) from public.orders) = 0, 'kitchen B sees no kitchen A orders');
select pg_temp.assert((select count(*) from public.kitchen_customers) = 0, 'kitchen B sees no kitchen A customers');
select pg_temp.assert((select count(*) from public.audit_logs where tenant_id = :'ta') = 0, 'kitchen B cannot read A audit logs');

-- payment (service role), commission 10% snapshot
select pg_temp.reset();
insert into public.payments (tenant_id, order_id, kitchen_customer_id, amount_minor, currency, msisdn, idempotency_key, status, checkout_request_id)
select tenant_id, id, kitchen_customer_id, total_minor, currency, '254700000000', 'k1', 'STK_SENT', 'ws_CO_1' from public.orders where id = :'ord';
select pg_temp.as_service();
select public.record_payment_success('ws_CO_1', 'RCPT1', 120000, '{}'::jsonb);
select public.record_payment_success('ws_CO_1', 'RCPT1', 120000, '{}'::jsonb);  -- replay is a no-op
select pg_temp.reset();
select pg_temp.assert((select status from public.orders where id = :'ord') = 'RECEIVED', 'order moves to RECEIVED after payment');
select pg_temp.assert((select commission_minor from public.orders where id = :'ord') = 12000 and (select kitchen_net_minor from public.orders where id = :'ord') = 108000, 'commission 10% snapshotted, kitchen net correct');
select pg_temp.assert((select count(*) from public.ledger_entries where order_id = :'ord') = 2, 'replay did not duplicate ledger entries');
select pg_temp.assert((select outstanding_minor from public.kitchen_balances where tenant_id = :'ta') = 108000, 'balance derived from ledger');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises($q$select public.record_payment_success('ws_CO_1','R',1,'{}')$q$, 'permission denied'), 'authenticated users cannot call record_payment_success');
select pg_temp.reset();

-- toggle commission OFF: history unchanged, new orders get 0
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select public.set_commission_rule('platform', null, null, false, 0, 0);
select pg_temp.assert((select commission_minor from public.orders where id = :'ord') = 12000, 'historical commission unchanged after toggle');

-- ledger immutable
select pg_temp.reset();
select pg_temp.assert(pg_temp.raises($q$update public.ledger_entries set amount_minor = 1$q$, 'append-only'), 'ledger update blocked');
select pg_temp.assert(pg_temp.raises($q$delete from public.ledger_entries$q$, 'append-only'), 'ledger delete blocked');

-- order state machine permissions
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.transition_order('%s','READY')$q$, :'ord'), 'invalid_transition'), 'illegal jump RECEIVED->READY rejected');
select public.transition_order(:'ord', 'ACCEPTED');
select pg_temp.as_user('c0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.transition_order('%s','PREPARING')$q$, :'ord'), 'permission_denied'), 'customer cannot prepare order');
select pg_temp.assert((select count(*) from public.notifications where audience='customer') >= 2, 'customer notified of status changes');

-- payouts
select pg_temp.as_user('f0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.create_payout('%s', 1000000)$q$, :'ta'), 'insufficient_balance'), 'cannot payout more than balance');
select public.create_payout(:'ta', 100000) as po \gset
select public.complete_payout(:'po', 'MPESA-REF');
select pg_temp.reset();
select pg_temp.assert((select outstanding_minor from public.kitchen_balances where tenant_id = :'ta') = 8000, 'payout reduces outstanding balance');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
select pg_temp.assert(pg_temp.raises(format($q$select public.create_payout('%s', 1)$q$, :'ta'), 'permission_denied'), 'kitchen admin cannot create payouts');

-- staff limits & last admin
select pg_temp.assert(pg_temp.raises(format($q$select public.update_staff_member((select id from public.tenant_members where tenant_id='%s'), 'worker', true)$q$, :'ta'), 'last_admin'), 'cannot demote last kitchen admin');
rollback;
