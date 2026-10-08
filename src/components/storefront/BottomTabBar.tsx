'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/ui/primitives/Icon';

const TABS: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/', label: 'Home', icon: 'home', match: (p) => p === '/' },
  { href: '/menu', label: 'Menu', icon: 'menu-book', match: (p) => p.startsWith('/menu') || p.startsWith('/item') },
  { href: '/cart', label: 'Cart', icon: 'cart', match: (p) => p.startsWith('/cart') || p.startsWith('/checkout') },
  { href: '/account/orders', label: 'Orders', icon: 'receipt', match: (p) => p.startsWith('/account/orders') || p.startsWith('/orders') },
  { href: '/account', label: 'Account', icon: 'user', match: (p) => p === '/account' || p.startsWith('/login') || p.startsWith('/register') },
];

/** Mobile-only bottom navigation on the brand colour. Active tab = filled icon + underline. */
export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 bg-brand text-brand-contrast shadow-raised md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={active ? 'page' : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-caption ${active ? 'font-semibold text-brand-contrast' : 'text-brand-contrast/75'}`}>
                <Icon name={t.icon} size={22} filled={active} />
                <span>{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
