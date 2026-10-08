/** Centralised, validated environment access. Server-only values are never read in client bundles. */
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  rootDomain: (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost').toLowerCase(),
  supabaseTransforms: process.env.NEXT_PUBLIC_SUPABASE_TRANSFORMS === 'true',
} as const;

export const ADMIN_SUBDOMAIN = 'admin';
