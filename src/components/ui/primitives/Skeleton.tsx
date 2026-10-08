import { cn } from '../cn';

/** A placeholder block used while content loads. */
export interface SkeletonProps {
  className?: string;
  /** Shorter, narrower bars. */
  short?: boolean;
  /** Medium width bars. */
  medium?: boolean;
  /** Full-width card-sized bar. */
  card?: boolean;
  /** Round the ends. */
  rounded?: boolean;
}

export function Skeleton({
  className, short, medium, card, rounded = true,
}: SkeletonProps) {
  const base = 'animate-pulse bg-line/60';
  const shape = rounded ? 'rounded-full' : 'rounded-md';
  if (short) return <div className={cn(base, shape, 'w-3/4 h-3', className)} />;
  if (medium) return <div className={cn(base, shape, 'w-1/2 h-4', className)} />;
  if (card) return <div className={cn(base, 'h-40 w-full rounded-md', className)} />;
  return <div className={cn(base, shape, className)} />;
}

/** A full-width linear-loading shimmer bar. */
export function ShimmerBar({ className }: { className?: string }) {
  return (
    <div className={cn('h-2 rounded-full bg-gradient-to-r from-line/30 via-line/10 to-line/30', className)}>
      <div className="h-full w-full animate-shimmer rounded-full" />
    </div>
  );
}
