import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { formatMoney } from '@/lib/commerce/money';

export const metadata = { title: 'Codensons — your kitchen, online' };

export default async function PlatformHome() {
  const supabase = await createClient();
  const [{ data: plans }, { data: pf }, { data: features }] = await Promise.all([
    supabase.from('plans').select('key, name, price_minor').order('sort_order'),
    supabase.from('plan_features').select('plan_key, feature_key, enabled').eq('enabled', true),
    supabase.from('features').select('key, description, kind').eq('kind', 'flag'),
  ]);
  return (<>
    <Section tone="brand"><div className="max-w-2xl"><h1 className="text-display">Your kitchen, taking orders online.</h1>
      <p className="mt-4 text-body-lg opacity-90">Get your own ordering website with M-Pesa payments, a live order board for your team and clear payouts.</p>
      <Link href="/start" className="mt-8 inline-flex h-12 items-center rounded-pill bg-accent px-8 text-body-lg font-semibold text-accent-contrast">Open your kitchen</Link></div></Section>
    <Section><h2 className="text-h2">Plans</h2>
      {(plans ?? []).length === 0 ? <p className="mt-4 text-ink-soft">Plans will be listed here soon.</p> : (
        <ul className="mt-6 grid gap-4 md:grid-cols-3">{(plans ?? []).map((p: { key: string; name: string; price_minor: number }) => (
          <li key={p.key} className="rounded-lg border border-line p-5"><h3 className="text-h3">{p.name}</h3>
            <p className="mt-1 text-price">{p.price_minor > 0 ? `${formatMoney(p.price_minor)} / month` : 'Pricing on request'}</p>
            <ul className="mt-3 flex flex-col gap-1 text-body text-ink-soft">{(features ?? []).filter((f: { key: string }) => (pf ?? []).some((x: { plan_key: string; feature_key: string }) => x.plan_key === p.key && x.feature_key === f.key)).map((f: { key: string; description: string }) => <li key={f.key}>{f.description}</li>)}</ul></li>))}</ul>)}</Section>
  </>);
}
