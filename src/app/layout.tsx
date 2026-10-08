import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { fontVariables } from '@/theme/fonts';
import { defaultTheme } from '@/theme/theme';
import { themeToCss } from '@/theme/resolve';
import { getTenantOptional } from '@/lib/tenant/get-tenant';

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getTenantOptional();
  if (!tenant || tenant.status !== 'active') return { title: 'Codensons', robots: { index: false, follow: false } };
  const base = tenant.primary_hostname ? new URL(`https://${tenant.primary_hostname}`) : undefined;
  const title = tenant.seo_title ?? tenant.name;
  const description = tenant.seo_description ?? tenant.description ?? `Order online from ${tenant.name}.`;
  return {
    metadataBase: base,
    title: { default: title, template: `%s | ${tenant.name}` },
    description,
    alternates: { canonical: '/' },
    openGraph: { title, description, siteName: tenant.name, type: 'website', images: tenant.cover_url ? [tenant.cover_url] : undefined },
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const tenant = await getTenantOptional();
  const theme = tenant?.theme ?? defaultTheme;
  const css = themeToCss(theme);
  const fontClasses = Array.from(new Set(Object.values(theme.fonts).map((k) => fontVariables[k]))).join(' ');
  return (
    <html lang="en" className={fontClasses}>
      <head>
        {/* Server-generated from validated theme tokens only; contains no user-supplied strings. */}
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
