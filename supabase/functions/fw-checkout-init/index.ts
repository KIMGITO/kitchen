// POST { order_id, phone, idempotency_key } with the customer's JWT. Starts a Flutterwave hosted checkout (M-Pesa or card).
// 1. Caller must own the order (RLS). 2. Resume an open checkout if there is one. 3. begin_payment (atomic, idempotent,
// rate-limited, same as the M-Pesa path). 4. Create the hosted payment link. Money is only recorded by the webhook / fw-verify
// after Flutterwave confirms the charge; nothing here marks anything paid.
import { corsHeaders, json, serviceClient, userClient } from '../_shared/clients.ts';
import { createPaymentLink } from '../_shared/flutterwave.ts';
import { buildTxRef, toMajor } from '../_shared/flutterwave-utils.ts';
import { normalizeMsisdn } from '../_shared/mpesa-utils.ts';

const RESUME_MINUTES = 25;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, corsHeaders);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'not_authenticated' }, 401, corsHeaders);

  let input: { order_id?: string; phone?: string; idempotency_key?: string };
  try { input = await req.json(); } catch { return json({ error: 'invalid_json' }, 400, corsHeaders); }
  const { order_id, phone, idempotency_key } = input;
  if (!order_id || !phone || !idempotency_key || idempotency_key.length < 8 || idempotency_key.length > 80) {
    return json({ error: 'invalid_request' }, 400, corsHeaders);
  }
  const msisdn = normalizeMsisdn(phone);
  if (!msisdn) return json({ error: 'invalid_phone', message: 'Enter a valid Kenyan mobile number, e.g. +254 712 345 678.' }, 400, corsHeaders);

  const caller = userClient(auth);
  const { data: userData, error: userErr } = await caller.auth.getUser();
  const user = userData?.user;
  if (userErr || !user || !user.email) return json({ error: 'not_authenticated', message: 'Log in to pay.' }, 401, corsHeaders);

  // RLS: callers only see their own orders.
  const { data: order } = await caller.from('orders').select('id, currency, contact_name').eq('id', order_id).maybeSingle();
  if (!order) return json({ error: 'order_not_found' }, 404, corsHeaders);

  const svc = serviceClient();

  // An abandoned checkout can simply be continued: hand back the same link instead of blocking with "payment in progress".
  const { data: open } = await svc.from('payments').select('id, provider, checkout_url, checkout_request_id, created_at')
    .eq('order_id', order_id).in('status', ['INITIATED', 'STK_SENT']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (open) {
    const fresh = Date.now() - new Date(open.created_at).getTime() < RESUME_MINUTES * 60_000;
    if (fresh && open.provider === 'flutterwave' && open.checkout_url) {
      return json({ ok: true, link: open.checkout_url, payment_id: open.id, resumed: true, message: 'Continue to the payment page.' }, 200, corsHeaders);
    }
    if (!fresh) {  // stale attempt: close it so a new one can start
      if (open.checkout_request_id) {
        await svc.rpc('record_payment_failure', { p_checkout_request_id: open.checkout_request_id, p_status: 'TIMEOUT', p_result_code: null, p_result_desc: 'Checkout abandoned', p_raw: {} });
      } else await svc.rpc('fail_payment_initiation', { p_payment: open.id, p_desc: 'abandoned' });
    }
  }

  const { data: begun, error: beginErr } = await svc.rpc('begin_payment', {
    p_order: order_id, p_user: user.id, p_msisdn: msisdn, p_idempotency_key: idempotency_key,
  });
  if (beginErr || !begun?.[0]) {
    const code = (beginErr?.message ?? '').split(':')[0];
    const friendly: Record<string, string> = {
      payment_in_progress: 'A payment is already open for this order. Finish it or wait a few minutes and try again.',
      too_many_attempts: 'Too many payment attempts for this order. Place a new order.',
      order_not_payable: 'This order can no longer be paid.',
      amount_not_whole_shillings: 'This order total cannot be paid online.',
      rate_limited: 'Too many payment attempts. Wait a few minutes and try again.',
    };
    return json({ error: code || 'payment_start_failed', message: friendly[code] ?? 'We could not start the payment.' }, 409, corsHeaders);
  }
  const pay = begun[0] as { pay_id: string; pay_amount_minor: number; pay_tenant_id: string; pay_order_number: number };

  // Redirect the customer back to THEIR kitchen's address (this platform is multi-tenant).
  const { data: tenant } = await svc.from('tenants').select('name').eq('id', pay.pay_tenant_id).maybeSingle();
  const { data: dom } = await svc.from('tenant_domains').select('hostname').eq('tenant_id', pay.pay_tenant_id).eq('is_primary', true).maybeSingle();
  const host = dom?.hostname as string | undefined;
  const origin = host ? `${/^localhost|\.localhost/.test(host) ? 'http' : 'https'}://${host}` : (Deno.env.get('APP_URL') ?? '');
  if (!origin) {
    await svc.rpc('fail_payment_initiation', { p_payment: pay.pay_id, p_desc: 'no_redirect_origin' });
    return json({ error: 'not_configured', message: 'Payments are not set up for this kitchen yet.' }, 503, corsHeaders);
  }

  const txRef = buildTxRef(pay.pay_id);
  try {
    const fw = await createPaymentLink({
      tx_ref: txRef,
      amount: toMajor(Number(pay.pay_amount_minor)),
      currency: String(order.currency ?? 'KES').trim(),
      redirect_url: `${origin}/orders/${order.id}?paid=1`,
      payment_options: 'mpesa,card',
      customer: { email: user.email, phonenumber: msisdn, name: String(order.contact_name ?? user.user_metadata?.full_name ?? 'Customer').slice(0, 60) },
      meta: { payment_id: pay.pay_id, order_id: order.id, tenant_id: pay.pay_tenant_id },
      customizations: { title: String(tenant?.name ?? 'Food order').slice(0, 40), description: `Order #${pay.pay_order_number}` },
    });
    if (!fw.ok || !fw.data?.link) {
      await svc.rpc('fail_payment_initiation', { p_payment: pay.pay_id, p_desc: fw.message.slice(0, 200) });
      return json({ error: 'checkout_rejected', message: 'The payment page could not be created. Try again.' }, 502, corsHeaders);
    }
    await svc.rpc('attach_checkout', { p_payment: pay.pay_id, p_tx_ref: txRef, p_link: fw.data.link });
    return json({ ok: true, link: fw.data.link, payment_id: pay.pay_id, message: 'Opening the secure payment page.' }, 200, corsHeaders);
  } catch (e) {
    await svc.rpc('fail_payment_initiation', { p_payment: pay.pay_id, p_desc: `exception: ${(e as Error).message}`.slice(0, 200) });
    return json({ error: 'checkout_unavailable', message: 'The payment service is not reachable right now. Try again shortly.' }, 502, corsHeaders);
  }
});
