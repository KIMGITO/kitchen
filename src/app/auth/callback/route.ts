import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getTenantOptional } from '@/lib/tenant/get-tenant';

/**
 * Finishes email-confirmation links and Google sign-in.
 * Google is for CUSTOMERS only: if the account belongs to kitchen staff or platform staff the session is dropped.
 * The check keys off the account's most recent sign-in provider, so removing `flow=customer` from the URL does not bypass it.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const safe = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (!code) return NextResponse.redirect(`${origin}/login?error=oauth_failed`);

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/login?error=oauth_failed`);

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/login?error=oauth_failed`);

  const lastProvider = [...(user.identities ?? [])].sort((a, b) => (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? ''))[0]?.provider;
  if (lastProvider !== 'google' && searchParams.get('flow') !== 'customer') return NextResponse.redirect(`${origin}${safe}`);

  const { data: isStaff } = await supabase.rpc('is_staff_account');
  if (isStaff) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=staff_account`);
  }

  const tenant = await getTenantOptional();
  if (!tenant) { await supabase.auth.signOut(); return NextResponse.redirect(`${origin}/login?error=oauth_failed`); }
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const fullName = (meta.full_name ?? meta.name ?? user.email?.split('@')[0] ?? 'Customer').trim().slice(0, 120) || 'Customer';
  const { data: existing } = await supabase.from('kitchen_customers').select('id').eq('tenant_id', tenant.id).maybeSingle();
  const { error: regErr } = existing ? { error: null } : await supabase.rpc('register_kitchen_customer', { p_tenant: tenant.id, p_full_name: fullName });
  if (regErr) return NextResponse.redirect(`${origin}/login?error=register_failed`);
  return NextResponse.redirect(`${origin}${safe}`);
}
