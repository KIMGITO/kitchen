import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { formatMoney } from '@/lib/commerce/money';
import PricingPlans from '@/components/global/PricingPlans';

export const metadata = { title: 'Codensons — your kitchen, online' };

export default async function PlatformHome() {
  const supabase = await createClient();
  const [{ data: plans }, { data: pf }, { data: features }] = await Promise.all(
    [
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
    ],
  );
  return (
    <div className="flex flex-col  bg-brand">
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
            className="mt-8 inline-flex h-12 items-center rounded-pill bg-accent px-8 text-body-lg font-semibold text-accent-contrast"
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
         plans={plans}
         features={features}
         pf={pf}
         />
        )}
      </Section>
    </div>
  );
}
