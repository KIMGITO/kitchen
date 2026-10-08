import type { SVGAttributes, ReactNode } from 'react';
import { cn } from '@/components/ui/cn';

export type IconName = 'check' | 'arrow-right' | 'plus' | 'minus' | 'x' | 'menu' | 'search' | 'bell' | 'cart' | 'log-out' | 'settings' | 'users' | 'money' | 'chevron-right' | 'chevron-down' | 'refresh' | 'clock' | 'star' | 'phone' | 'mail' | 'calendar' | 'map-pin' | 'help-circle' | 'info-circle' | 'alert-triangle' | 'shield' | 'tag' | 'package' | 'trash' | 'pencil' | 'download' | 'upload' | 'external-link';

function P(d: string) {
  return <path d={d} stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />;
}

const paths: Record<IconName, ReactNode> = {
  check: P('M4 12.5l5 5L20 6.5'),
  'arrow-right': <><path d="M5 12h14" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M13 6l6 6-6 6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></>,
  plus: <><path d="M12 5v14" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M5 12h14" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  minus: P('M5 12h14'),
  x: <><path d="M6 6l12 12" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M18 6L6 18" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  menu: <><path d="M4 7h16" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M4 12h16" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M4 17h16" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  search: <><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2.2} /><path d="M16 16l5 5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  bell: <><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M13.7 21a2 2 0 01-3.4 0" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  cart: <><circle cx="9" cy="21" r="1.5" fill="currentColor" stroke="none" /><circle cx="17" cy="21" r="1.5" fill="currentColor" stroke="none" /><path d="M3 5h18l-2 12H5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></>,
  'log-out': <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M16 17l5-5-5-5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M21 12H9" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  settings: <><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={2.2} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  users: <><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth={2.2} /><path d="M3 20a6 6 0 016-6h6a6 6 0 016 6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  money: P('M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6'),
  'chevron-right': P('M9 5l7 7-7 7'),
  'chevron-down': P('M19 9l-7 7-7-7'),
  refresh: <><path d="M21 12a9 9 0 11-2.64-6.36" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M21 3v6h-6" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  clock: <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.2} /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  star: <><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.2l1-5.8-4.3-4.1 5.9-.9L12 3z" fill="currentColor" /></>,
  phone: P('M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .3 2 .5 3a2 2 0 01-.5 2L8 9.9a16 16 0 006 6l1-1.2a2 2 0 012-.5c1 .3 2 .4 3 .6a2 2 0 012 2z'),
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth={2.2} /><path d="M22 7l-10 6L2 7" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth={2.2} /><path d="M16 3v4M8 3v4M3 10h18" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  'map-pin': <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z" stroke="currentColor" strokeWidth={2.2} /><circle cx="12" cy="10" r="2.5" fill="currentColor" stroke="none" /></>,
  'help-circle': <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.2} /><path d="M9.1 9a3 3 0 015.8 1c0 2-3 2.5-3 4" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /><path d="M12 17h.01" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" /></>,
  'info-circle': <><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={2.2} /><path d="M12 11v5M12 8h.01" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  'alert-triangle': <><path d="M12 3L2 20h20L12 3z" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" /><path d="M12 10v4M12 17.5h.01" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" /></>,
  shield: <><path d="M12 3l7 2.5V11c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V5.5L12 3z" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" /><path d="M8.5 11.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></>,
  tag: P('M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0L2 12V2h10l8.6 8.6a2 2 0 010 2.8z'),
  package: P('M21 8l-9-5-9 5v8l9 5 9-5V8z'),
  trash: P('M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13'),
  pencil: P('M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z'),
  download: P('M12 3v12M7 10l5 5 5-5M5 21h14'),
  upload: P('M12 15V3M7 8l5-5 5 5M5 21h14'),
  'external-link': P('M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6'),
};

export interface IconProps extends SVGAttributes<SVGElement> { name: IconName; size?: number; }

export function Icon({ name, size = 18, className, ...rest }: IconProps) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={cn('shrink-0', className)} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...rest}>{paths[name]}</svg>);
}
