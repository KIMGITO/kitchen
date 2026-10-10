'use client';
import { useActionState, useEffect, type ReactNode } from 'react';
import { toast } from '@/stores/toast';
import { SubmitButton } from './SubmitButton';
import type { ActionResult } from '@/lib/actions/result';

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Wraps a server action with pending/success/error states. Keeps pages free of boilerplate. */
export function ActionForm({ action, submitLabel, pendingLabel, children, className, variant = 'primary' }:
  { action: Action; submitLabel: string; pendingLabel?: string; children?: ReactNode; className?: string; variant?: 'primary' | 'accent' | 'outline' | 'danger' }) {
  const [state, formAction, pending] = useActionState(action, null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) { if (state.message) toast.success(state.message); } else toast.error(state.error);
  }, [state]);
  return (
    <form action={formAction} className={className ?? 'flex flex-col gap-4'}>
      {children}
      {state && !state.ok ? <p role="alert" className="text-caption text-danger">{state.error}</p> : null}
      {state && state.ok && state.message ? <p role="status" className="text-caption text-success">{state.message}</p> : null}
      <div><SubmitButton variant={variant} loading={pending} loadingText={pendingLabel ?? `${submitLabel.replace(/…$/, '')}…`}>{submitLabel}</SubmitButton></div>
    </form>
  );
}

