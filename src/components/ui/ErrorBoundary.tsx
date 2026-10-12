'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { describeError } from '@/lib/errors';

/**
 * Shared route-level error boundary.
 *
 * The default Next.js boundary shows only "Something went wrong" and a digest,
 * which is useless when a page fails because a table or migration is missing —
 * exactly the situation after a database reset. We surface the underlying message
 * (still through `describeError`, which keeps friendly wording for known codes and
 * shows the raw cause otherwise) so the operator can act on it in the browser.
 */
export function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  const detail = describeError(error?.message);
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-start gap-3 p-6">
      <h1 className="text-h2">Something went wrong</h1>
      <p className="text-body text-ink-soft">This page could not load. Your data is safe. Try again.</p>
      <pre className="w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-alt p-3 text-caption text-ink-soft">{detail}</pre>
      {error?.digest ? <p className="text-caption text-ink-soft">Reference: {error.digest}</p> : null}
      <Button type="button" onClick={reset}>Try again</Button>
    </div>
  );
}
