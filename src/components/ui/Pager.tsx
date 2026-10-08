import Link from 'next/link';

export const PAGE_SIZE = 25;
export function pageOf(raw: string | undefined) { const n = Number(raw); return Number.isInteger(n) && n > 0 ? n : 1; }
export function range(page: number) { return [(page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1] as const; }

export function Pager({ page, hasMore, basePath }: { page: number; hasMore: boolean; basePath: string }) {
  if (page === 1 && !hasMore) return null;
  const sep = basePath.includes('?') ? '&' : '?';
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-label">
      {page > 1 ? <Link href={`${basePath}${sep}page=${page - 1}`} className="rounded-pill border border-line px-4 py-2 hover:bg-surface-alt">Previous</Link> : <span />}
      <span className="text-ink-soft">Page {page}</span>
      {hasMore ? <Link href={`${basePath}${sep}page=${page + 1}`} className="rounded-pill border border-line px-4 py-2 hover:bg-surface-alt">Next</Link> : <span />}
    </nav>
  );
}
