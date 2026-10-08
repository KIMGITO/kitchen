import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';
import { classifyHost, TENANT_HOST_HEADER } from '@/lib/tenant/host';
import { refreshSession } from '@/lib/supabase/middleware';

/**
 * host -> app area
 *   example.com        -> /platform/*        (kitchen onboarding / marketing)
 *   admin.example.com  -> /platform-admin/*  (SaaS admin)
 *   anything else      -> tenant routes, with the validated hostname forwarded in a header
 * Internal prefixes are unreachable by direct URL on any host.
 */
export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const target = classifyHost(host, publicEnv.rootDomain);
  const path = request.nextUrl.pathname;

  // Never trust a client-supplied tenant header.
  const forwarded = new Headers(request.headers);
  forwarded.delete(TENANT_HOST_HEADER);

  if (path.startsWith('/platform-admin') || path.startsWith('/platform')) {
    return new NextResponse('Not found', { status: 404 });
  }

  let response: NextResponse;
  if (target.kind === 'platform') {
    const url = request.nextUrl.clone();
    url.pathname = `/platform${path === '/' ? '' : path}`;
    response = NextResponse.rewrite(url, { request: { headers: forwarded } });
  } else if (target.kind === 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = `/platform-admin${path === '/' ? '' : path}`;
    response = NextResponse.rewrite(url, { request: { headers: forwarded } });
  } else {
    forwarded.set(TENANT_HOST_HEADER, target.hostname);
    response = NextResponse.next({ request: { headers: forwarded } });
  }
  return refreshSession(request, response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
