/**
 * Central UI component library.
 *
 * Re-export everything from the `@/components/ui` folder so pages and
 * components import through a single entry point and can be swapped out
 * wholesale if the design system changes.
 */
export { Button } from './Button';
export type { ButtonProps } from './Button';
export { Input } from './Input';
export type { InputProps } from './Input';
export { Field } from './primitives/Field';
export { ChoiceChip } from './primitives/ChoiceChip';
export type { ChoiceChipProps } from './primitives/ChoiceChip';
export { Badge, StatusBadge } from './primitives/Badge';
export type { BadgeProps } from './primitives/Badge';
export type { OrderStatus } from '@/lib/commerce/order-state';
export { Card, CardBlock } from './primitives/Card';
export { Icon } from './primitives/Icon';
export type { IconName } from './primitives/Icon';
export { NavLink } from './primitives/NavLink';
export { Skeleton, ShimmerBar } from './primitives/Skeleton';
export { Section } from './Section';
export { EmptyState, ErrorState } from './EmptyState';
export { StatusBadge as legacyStatusBadge } from './StatusBadge';
export { Pager } from './Pager';
export { NotificationBell } from './NotificationBell';
export { RealtimeRefresh } from './RealtimeRefresh';
export { ActionForm } from './ActionForm';
export { ImageUploader } from './ImageUploader';
