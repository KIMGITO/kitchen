import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { formatMoney } from '@/lib/commerce/money';
import { PricingPlans } from '@/components/global/PricingPlans';
import { describeError } from '@/lib/errors';

export const metadata = { title: 'Codensons — your kitchen, online' };

export default async function PlatformHome() {
  const supabase = await createClient();
  const [
    { data: plans, error: plansError },
    { data: pf, error: pfError },
    { data: features, error: featuresError },
    { data: setupRequired },
  ] = await Promise.all([
    supabase
      .from('plans')
      .select('key, name, price_minor')
      .order('sort_order'),
    supabase
      .from('plan_features')
      .select('plan_key, feature_key, enabled')
      .eq('enabled', true),
    supabase
      .from('features')
      .select('key, description, kind')
      .eq('kind', 'flag'),
    supabase.rpc('platform_setup_required'),
  ]);
  // A missing table or an unapplied migration used to render as an empty plans
  // section with no explanation. Show the real cause so the operator can act on it.
  const loadError = describeError(
    plansError?.message ?? pfError?.message ?? featuresError?.message,
    '',
  );
  // After a database reset there is no owner, so the next thing to do is /setup.
  const needsSetup = setupRequired === true;
  return (
    <div className="flex flex-col  bg-brand">
      {needsSetup ? (
        <div role="alert" className="border-b border-line bg-accent-soft px-4 py-3 text-center text-body text-ink">
          This platform has no owner yet. <Link className="underline" href="/setup">Finish setup</Link> to create the first admin account.
        </div>
      ) : null}
      {loadError ? (
        <p role="alert" className="mx-auto max-w-3xl whitespace-pre-wrap break-words rounded-md border border-danger/30 bg-danger/5 px-4 py-3 text-caption text-ink-soft">
          {loadError}
        </p>
      ) : null}
      <Section
        overlay={8}
        blur="left"
        rounded={'5xl'}
        corners={['br']}
        blurLevel={8}
        align="left"
        imageUrl="https://images.unsplash.com/photo-1665332195309-9d75071138f0?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxzZWFyY2h8Mnx8a2VueWFuJTIwZm9vZHxlbnwwfHwwfHx8MA%3D%3D"
        tone="brand"
        
      >
        <div className="max-w-2xl md:bg-gradient-to-r from-surface/10 to-brand/5 p-8 ">
          <h1 className="text-display">Your kitchen, taking orders online.</h1>
          <p className="mt-4 text-body-lg opacity-90">
            Get your own ordering website with M-Pesa payments, a live order
            board for your team and clear payouts.
          </p>
          <Link
            href="/start"
            className="mt-8 inline-flex h-12 items-center rounded-pill bg-accent px-8 text-body-lg text-accent-contrast"
          >
            Open your kitchen
          </Link>
        </div>
      </Section>
      <Section 
      // className='border-0 bg-gradient-to-tr from-white  to-brand'
      tone='brand'
      rounded={'5xl'}
      corners={'tl'}


      >
        <h2 className="text-h2">Plans</h2>
        {(plans ?? []).length === 0 ? (
          <p className="mt-4 text-ink-soft">Plans will be listed here soon.</p>
        ) : (
         <PricingPlans  
         plans={plans ?? undefined}
         features={features ?? undefined}
         pf={pf ?? undefined}
         />
        )}
      </Section>
    </div>
  );
}
