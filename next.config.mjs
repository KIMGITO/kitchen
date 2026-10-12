/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------------------------------------------------
// Public variables are INLINED at build time (browser bundle, CSP header, host routing). On Cloudflare they must exist in the
// *build* environment (Workers Builds > Settings > Build > Variables), not only as runtime secrets. If they are missing the
// build would still succeed and the live site would silently break (root domain falls back to "localhost", browser Supabase
// client throws on load). So fail the Cloudflare build loudly instead.
// ---------------------------------------------------------------------------------------------------------------------
{
  const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_ROOT_DOMAIN'];
  const missing = required.filter((k) => !process.env[k]);
  const onCloudflare = process.env.WORKERS_CI === '1' || process.env.CF_PAGES === '1';
  const strict = process.env.NODE_ENV === 'production' && (onCloudflare || process.env.REQUIRE_PUBLIC_ENV === '1');
  const rootIsLocal = /^localhost(:\d+)?$/.test(process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '');
  if (strict && (missing.length > 0 || rootIsLocal)) {
    throw new Error(
      `Missing or invalid build-time environment variables: ${[...missing, ...(rootIsLocal ? ['NEXT_PUBLIC_ROOT_DOMAIN (cannot be localhost in production)'] : [])].join(', ')}.\n` +
        'Add them under Cloudflare > Workers & Pages > your Worker > Settings > Build > Variables and redeploy. See README "Cloudflare".',
    );
  }
}

// Extract host and origin safely from env
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : '';

// Secure WebSocket protocol conversion (handles both http -> ws AND https -> wss)
const supabaseWs = supabaseOrigin.replace(/^http(s)?/, 'ws$1');

const isDev = process.env.NODE_ENV !== 'production';

// Cloudflare Web Analytics injects its beacon from static.cloudflareinsights.com.
// Without an explicit entry the strict CSP blocks it and logs a console error on
// every page (it is a zero-impact script, so allowing it is safe).
const cloudflareInsights = 'https://static.cloudflareinsights.com';

// Robust Content Security Policy
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${cloudflareInsights}${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Fixed: Added wildcard *.unsplash.com and unsplash.com to cover all CDN/asset domains
  `img-src 'self' data: blob: ${supabaseOrigin} https://images.unsplash.com https://unsplash.com https://*.unsplash.com`
    .replace(/\s+/g, ' ')
    .trim(),
  "font-src 'self' data:",
  // Fixed: Supports secure wss:// connections for Supabase Realtime
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`
    .replace(/\s+/g, ' ')
    .trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './src/lib/images/supabase-loader.ts',
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    workerThreads: false, 
    webpackMemoryOptimizations: true, 
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), browsing-topics=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;