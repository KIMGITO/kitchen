// fw-checkout-init: create a Flutterwave Standard payment for an order.
// - Caller: logged-in customer (user JWT), body { order_id }.
// - Commission % is fetched live from platform_config() (single source of truth).
// - Kitchen net is routed via the subaccount split when the kitchen is verified;
//   otherwise the platform receives the full amount and the net settles later.
// - Stores an fw_payment_intents row keyed by tx_ref for the webhook to complete.
// Response: { ok:true, link, tx_ref, amount, commission, kitchen_net }.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
import { fwFetch, json, minorToMajor, withCors, cors } from "../_shared/flutterwave.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "";

function userClient(req: Request) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

serve(async (req) => {
  const preflight = cors(req);
  if (preflight) return preflight;
  const send = (b: unknown, s = 200) => withCors(json(b, s));
  try {
    if (req.method !== "POST") return send({ ok: false, message: "Method not allowed" }, 405);
    const { order_id } = await req.json().catch(() => ({}));
    if (!order_id) return send({ ok: false, message: "order_id is required" }, 400);

    const userDb = userClient(req);
    const { data: { user } } = await userDb.auth.getUser();
    if (!user) return send({ ok: false, message: "Log in to pay." }, 401);

    // RLS on orders governs visibility: callers can only init payment for orders they may read.
    const { data: order, error: orderErr } = await userDb
      .from("orders")
      .select("id, tenant_id, total_minor, currency, status")
      .eq("id", order_id)
      .maybeSingle();
    if (orderErr || !order) return send({ ok: false, message: "Order not found." }, 404);
    if (order.status !== "PENDING_PAYMENT") {
      return send({ ok: false, message: "This order can no longer be paid." }, 409);
    }
    const total = Number(order.total_minor ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      return send({ ok: false, message: "Invalid order amount." }, 400);
    }

    const svc = serviceClient();
    const { data: cfg } = await svc.rpc("platform_config");
    const pct = Number(cfg?.commission_percentage ?? 10);
    const currency = String(cfg?.system_currency ?? order.currency ?? "KES");
    const commission = Math.floor(total * pct / 100);
    const kitchenNet = total - commission;

    const { data: tenant } = await svc.from("tenants")
      .select("id, name, flutterwave_subaccount_id, is_verified")
      .eq("id", order.tenant_id)
      .maybeSingle();

    const txRef = `ord_${order.id.replace(/-/g, "").slice(0, 12)}_${Date.now()}`;
    const customerEmail = user.email ?? `${user.id}@customer.local`;
    const payload: Record<string, unknown> = {
      tx_ref: txRef,
      amount: minorToMajor(total),
      currency,
      redirect_url: `${APP_URL}/orders/${order.id}?paid=1`,
      customer: { email: customerEmail, name: user.user_metadata?.full_name ?? "Customer" },
      meta: { order_id: order.id, tenant_id: order.tenant_id, commission_minor: commission },
      customizations: { title: tenant?.name ?? "Food order", description: `Order payment` },
    };
    // Split: kitchen subaccount receives its net flat; the platform keeps the commission.
    if (tenant?.is_verified && tenant?.flutterwave_subaccount_id) {
      payload.subaccounts = [{
        id: tenant.flutterwave_subaccount_id,
        transaction_charge: minorToMajor(kitchenNet),
        transaction_charge_type: "flat",
      }];
    }

    const fw = await fwFetch<{ link?: string; id?: number }>("/payments", {
      method: "POST",
      body: payload,
    });
    if (!fw.ok || !fw.data?.link) {
      return send({ ok: false, message: fw.message || "Could not start the payment." }, 502);
    }

    await svc.from("fw_payment_intents").upsert({
      tx_ref: txRef,
      tenant_id: order.tenant_id,
      order_id: order.id,
      amount_minor: total,
      commission_bps: Math.round(pct * 100),
      commission_minor: commission,
      kitchen_net_minor: kitchenNet,
      currency,
      status: "initiated",
      flutterwave_id: fw.data.id ?? null,
    }, { onConflict: "tx_ref" });

    return send({
      ok: true,
      link: fw.data.link,
      tx_ref: txRef,
      amount_minor: total,
      commission_minor: commission,
      kitchen_net_minor: kitchenNet,
      split: Boolean(payload.subaccounts),
      message: "Redirecting to the payment page.",
    });
  } catch (e) {
    return send({ ok: false, message: e instanceof Error ? e.message : "Checkout failed." }, 500);
  }
});
