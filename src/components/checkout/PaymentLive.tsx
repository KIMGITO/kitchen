'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/ui/primitives/Icon';
import { describePaymentFailure } from '@/lib/commerce/mpesa-result';
import { toast } from '@/stores/toast';
import type { OrderStatus } from '@/lib/commerce/order-state';

export interface LivePayment {
  status: string; result_code: number | null; result_desc: string | null; provider_receipt: string | null; created_at: string;
}
const WAITING = ['INITIATED', 'STK_SENT'];
const PROMPT_SECONDS = 90;

/**
 * Shows the M-Pesa result the instant Safaricom's callback lands: it listens to this order's payment row over Realtime
 * (with a 4-second poll as a fallback) and flips from "waiting for your PIN" to a receipt or a plain-language reason.
 */
export function PaymentLive({ orderId, orderStatus, initial }: { orderId: string; orderStatus: OrderStatus; initial: LivePayment | null }) {
  const router = useRouter();
  const [pay, setPay] = useState<LivePayment | null>(initial);
  const [now, setNow] = useState(() => Date.now());
  const last = useRef<string | null>(initial ? `${initial.status}` : null);

  function apply(next: LivePayment) {
    setPay(next);
    if (last.current !== next.status) {
      last.current = next.status;
      if (next.status === 'SUCCEEDED') toast.success('Payment received. Thank you!');
      else if (!WAITING.includes(next.status)) toast.error(describePaymentFailure(next.result_code, next.result_desc));
      router.refresh();
    }
  }

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase.channel(`payment:${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `order_id=eq.${orderId}` },
        (p) => { if (p.new && 'status' in p.new) apply(p.new as unknown as LivePayment); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const waiting = !!pay && WAITING.includes(pay.status) && orderStatus === 'PENDING_PAYMENT';
  useEffect(() => {
    if (!waiting) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(async () => {
      const { data } = await createClient().from('payments').select('status, result_code, result_desc, provider_receipt, created_at')
        .eq('order_id', orderId).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (data) apply(data as LivePayment);
    }, 4000);
    return () => { clearInterval(tick); clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, orderId]);

  if (!pay) return null;

  if (pay.status === 'SUCCEEDED') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4">
        <Icon name="check-circle" size={32} className="animate-pop shrink-0 text-success" />
        <div><p className="text-h3 text-ink">Payment received</p>
          <p className="text-body text-ink-muted">{pay.provider_receipt ? <>M-Pesa reference <strong>{pay.provider_receipt}</strong>. </> : 'Your M-Pesa confirmation message is on its way. '}Your receipt is sent by SMS and email.</p></div>
      </div>
    );
  }

  if (waiting) {
    const left = Math.max(0, PROMPT_SECONDS - Math.floor((now - new Date(pay.created_at).getTime()) / 1000));
    return (
      <div role="status" aria-live="polite" className="flex items-start gap-4 rounded-lg border border-accent/60 bg-accent-soft p-4">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast">
          <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-accent/50" />
          <Icon name="mobile" size={24} className="relative" />
        </span>
        <div>
          <p className="text-h3 text-ink">Check your phone</p>
          <p className="text-body text-ink-muted">Enter your M-Pesa PIN on the prompt. This page updates the moment you pay.</p>
          <p className="mt-1 inline-flex items-center gap-1 text-caption text-ink-soft"><Icon name="hourglass" size={14} />
            {left > 0 ? `Prompt expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'The prompt may have expired. Send a new one below.'}</p>
        </div>
      </div>
    );
  }

  if (['FAILED', 'CANCELLED_BY_USER', 'TIMEOUT'].includes(pay.status) && (orderStatus === 'PAYMENT_FAILED' || orderStatus === 'PENDING_PAYMENT')) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/10 p-4">
        <Icon name="warning-circle" size={32} className="shrink-0 text-danger" />
        <div><p className="text-h3 text-ink">Payment not completed</p><p className="text-body text-ink-muted">{describePaymentFailure(pay.result_code, pay.result_desc)}</p></div>
      </div>
    );
  }
  return null;
}
