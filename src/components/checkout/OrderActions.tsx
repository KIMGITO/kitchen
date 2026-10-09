'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { friendlyError } from '@/lib/errors';
import { normalizeKePhone } from '@/lib/phone';
import { requestMpesaPayment } from '@/lib/payments-client';
import type { OrderStatus } from '@/lib/commerce/order-state';

export function OrderActions({ orderId, status, defaultPhone, initialNotice }: { orderId: string; status: OrderStatus; defaultPhone: string; initialNotice?: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState(normalizeKePhone(defaultPhone) ?? '');
  const [busy, setBusy] = useState<'pay' | 'cancel' | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(initialNotice ? { tone: 'error', text: initialNotice } : null);

  if (status !== 'PENDING_PAYMENT' && status !== 'PAYMENT_FAILED') return null;

  async function pay() {
    if (!phone) { setNotice({ tone: 'error', text: 'Enter a valid Kenyan mobile number first.' }); return; }
    setBusy('pay'); setNotice(null);
    const r = await requestMpesaPayment(orderId, phone);
    setNotice({ tone: r.ok ? 'ok' : 'error', text: r.message }); setBusy(null); router.refresh();
  }
  async function cancel() {
    if (!confirm('Cancel this order?')) return;
    setBusy('cancel');
    const { error } = await createClient().rpc('transition_order', { p_order: orderId, p_to: 'CANCELLED' });
    setBusy(null);
    if (error) setNotice({ tone: 'error', text: friendlyError(error.message) }); else router.refresh();
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <p className="text-body">{status === 'PAYMENT_FAILED' ? 'The payment did not go through. You can try again.' : 'Waiting for your M-Pesa payment. Enter your PIN on the prompt, or send a new one.'}</p>
      <PhoneInput label="M-Pesa phone number" defaultValue={defaultPhone} onValueChange={setPhone} required />
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="accent" loading={busy === 'pay'} loadingText="Sending prompt…" onClick={pay} autoLoading={false}>{status === 'PAYMENT_FAILED' ? 'Try payment again' : 'Send a new prompt'}</Button>
        <Button type="button" variant="outline" loading={busy === 'cancel'} loadingText="Cancelling…" onClick={cancel} autoLoading={false}>Cancel order</Button>
      </div>
      {notice ? <p role={notice.tone === 'error' ? 'alert' : 'status'} className={notice.tone === 'error' ? 'text-caption text-danger' : 'text-caption text-success'}>{notice.text}</p> : null}
    </div>
  );
}
