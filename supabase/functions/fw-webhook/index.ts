// fw-webhook: Flutterwave event receiver.
// - Verifies `verif-hash`, then handles charge.completed.
// - On success: marks the fw_payment_intents row + calls accrue_kitchen_ledger()
//   (idempotent via unique(order_id), so retries/double delivery are safe).
// - No API calls, no triggers: pure receive -> record -> 200 fast.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.0";
import { json, verifyWebhook } from "../_shared/flutterwave.ts";

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

serve(async (req) => {
  try {
    if (req.method !== "POST") return json({ ok: false, message: "Method not allowed" }, 405);
    if (!verifyWebhook(req)) return json({ ok: false, message: "Bad signature" }, 401);

    const event = await req.json().catch(() => null) as {
      event?: string; data?: {
        tx_ref?: string; id?: number; status?: string;
        amount?: number; currency?: string;
      };
    } | null;
    if (!event?.event) return json({ ok: true, message: "Ignored: no event" });

    // Only successful charges accrue to the kitchen ledger.
    if (event.event !== "charge.completed") return json({ ok: true, message: `Ignored: ${event.event}` });
    const d = event.data ?? {};
    if ((d.status ?? "").toLowerCase() !== "successful" || !d.tx_ref) {
      return json({ ok: true, message: "Ignored: not a successful charge" });
    }

    const svc = serviceClient();
    const { data: intent } = await svc.from("fw_payment_intents")
      .select("tx_ref, order_id, amount_minor, status")
      .eq("tx_ref", d.tx_ref)
      .maybeSingle();
    if (!intent) return json({ ok: true, message: "Ignored: unknown tx_ref" });
    if (intent.status === "successful") return json({ ok: true, message: "Already processed" });

    await svc.from("fw_payment_intents").update({
      status: "successful",
      flutterwave_id: typeof d.id === "number" ? d.id : undefined,
    }).eq("tx_ref", d.tx_ref);

    const { error: accrueErr } = await svc.rpc("accrue_kitchen_ledger", {
      p_order_id: intent.order_id,
      p_gross_minor: intent.amount_minor,
    });
    if (accrueErr) {
      // Intent is marked; accrual can be retried via webhook redelivery or requeue.
      console.error("accrue failed", d.tx_ref, accrueErr.message);
      return json({ ok: false, message: "Accrual failed; will retry on redelivery." }, 500);
    }
    return json({ ok: true, message: "Payment recorded." });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : "Webhook failed." }, 500);
  }
});
