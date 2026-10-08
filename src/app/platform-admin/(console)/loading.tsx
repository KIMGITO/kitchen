import { Skeleton } from '@/components/ui/primitives/Skeleton';

export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-8 w-1/3" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} card rounded={false} />)}
      </div>
    </div>
  );
}
