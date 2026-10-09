import type { SVGAttributes, ComponentType } from 'react';
import {
  Check, ArrowRight, Plus, Minus, X, List, MagnifyingGlass, Bell, ShoppingCart, SignOut, Gear, Users, Money,
  CaretRight, CaretDown, ArrowsClockwise, Clock, Star, Phone, Envelope, CalendarBlank, MapPin, Question, Info,
  Warning, ShieldCheck, Tag, Package, Trash, PencilSimple, DownloadSimple, UploadSimple, ArrowSquareOut,
  House, ForkKnife, Receipt, User, Eye, EyeSlash, DeviceMobile, CheckCircle, WarningCircle, Hourglass,
} from '@phosphor-icons/react/dist/ssr';

export type IconName = 'check' | 'arrow-right' | 'plus' | 'minus' | 'x' | 'menu' | 'search' | 'bell' | 'cart' | 'log-out' | 'settings' | 'users' | 'money' | 'chevron-right' | 'chevron-down' | 'refresh' | 'clock' | 'star' | 'phone' | 'mail' | 'calendar' | 'map-pin' | 'help-circle' | 'info-circle' | 'alert-triangle' | 'shield' | 'tag' | 'package' | 'trash' | 'pencil' | 'download' | 'upload' | 'external-link' | 'home' | 'menu-book' | 'receipt' | 'user' | 'eye' | 'eye-slash' | 'mobile' | 'check-circle' | 'warning-circle' | 'hourglass';

type Weight = 'regular' | 'bold' | 'fill';
type PhosphorIcon = ComponentType<{ size?: number; weight?: Weight; className?: string; 'aria-hidden'?: boolean }>;

/** Phosphor Icons, "regular" line weight (soft rounded geometry). Stars are filled. */
const icons: Record<IconName, { C: PhosphorIcon; weight?: Weight }> = {
  check: { C: Check, weight: 'bold' }, 'arrow-right': { C: ArrowRight }, plus: { C: Plus, weight: 'bold' }, minus: { C: Minus, weight: 'bold' },
  x: { C: X, weight: 'bold' }, menu: { C: List }, search: { C: MagnifyingGlass }, bell: { C: Bell }, cart: { C: ShoppingCart },
  'log-out': { C: SignOut }, settings: { C: Gear }, users: { C: Users }, money: { C: Money }, 'chevron-right': { C: CaretRight },
  'chevron-down': { C: CaretDown }, refresh: { C: ArrowsClockwise }, clock: { C: Clock }, star: { C: Star, weight: 'fill' },
  phone: { C: Phone }, mail: { C: Envelope }, calendar: { C: CalendarBlank }, 'map-pin': { C: MapPin }, 'help-circle': { C: Question },
  'info-circle': { C: Info }, 'alert-triangle': { C: Warning }, shield: { C: ShieldCheck }, tag: { C: Tag }, package: { C: Package },
  trash: { C: Trash }, pencil: { C: PencilSimple }, download: { C: DownloadSimple }, upload: { C: UploadSimple },
  'external-link': { C: ArrowSquareOut }, home: { C: House }, 'menu-book': { C: ForkKnife }, receipt: { C: Receipt }, user: { C: User },
  eye: { C: Eye }, 'eye-slash': { C: EyeSlash }, mobile: { C: DeviceMobile }, 'check-circle': { C: CheckCircle, weight: 'fill' },
  'warning-circle': { C: WarningCircle, weight: 'fill' }, hourglass: { C: Hourglass },
};

export interface IconProps extends SVGAttributes<SVGElement> { name: IconName; size?: number; filled?: boolean }

export function Icon({ name, size = 18, className, filled }: IconProps) {
  const { C, weight } = icons[name];
  return <C size={size} weight={filled ? 'fill' : weight ?? 'regular'} className={['shrink-0', className].filter(Boolean).join(' ')} aria-hidden />;
}
