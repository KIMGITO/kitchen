import type { Theme } from '@/theme/theme';

export type TenantStatus = 'pending_approval' | 'active' | 'suspended' | 'closed';

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: TenantStatus;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  profile_url: string | null;
  currency: string;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  delivery_fee_minor: number;
  min_order_minor: number;
  seo_title: string | null;
  seo_description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address_text: string | null;
  opening_hours: Record<string, unknown>;
  primary_hostname: string | null;
  theme: Theme;
}
