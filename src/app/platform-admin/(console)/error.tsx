'use client';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-start gap-3 p-6">
      <h1 className="text-h2">Something went wrong</h1>
      <p className="text-body text-ink-soft">This page could not load. Your data is safe. Try again.</p>
      <Button type="button" onClick={reset}>Try again</Button>
    </div>
  );
}
