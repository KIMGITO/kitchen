'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../cn';

/**
 * A navigation link that highlights the current route using the active
 * colour token, so nav items stay consistent across the dashboard and admin.
 */
export interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  /** When true, the link is always shown active (used for top-level brand links). */
  alwaysActive?: boolean;
}

export function NavLink({ href, children, className, alwaysActive = false }: NavLinkProps) {
  const pathname = usePathname();
  const active = alwaysActive || pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center gap-2 rounded-md px-3 py-2 text-label transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand',
        active
          ? 'bg-accent-soft font-semibold text-ink shadow-[inset_3px_0_0_0_rgb(var(--color-accent))]'
          : 'text-ink-muted hover:bg-accent-soft/60 hover:text-ink',
        className,
      )}
    >
      {children}
    </Link>
  );
}
