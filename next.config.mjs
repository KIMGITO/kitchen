/** @type {import('next').NextConfig} */

// Extract host and origin safely from env
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : '';

// Secure WebSocket protocol conversion (handles both http -> ws AND https -> wss)
const supabaseWs = supabaseOrigin.replace(/^http(s)?/, 'ws$1');

const isDev = process.env.NODE_ENV !== 'production';

// Robust Content Security Policy
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
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