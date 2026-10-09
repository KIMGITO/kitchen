'use client';
import { useFormStatus } from 'react-dom';
import { Button, type ButtonProps } from './Button';

/**
 * Submit button that shows a circular loader + text automatically while a
 * server-action form is pending. Use inside any `<form action={...}>`:
 * no `loading` prop or client state needed.
 */
export function SubmitButton({ loadingText = 'Saving…', loading, children, ...rest }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...rest} type="submit" loading={pending || Boolean(loading)} loadingText={loadingText}>
      {children}
    </Button>
  );
}
