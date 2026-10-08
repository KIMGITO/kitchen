import { createClient } from '@/lib/supabase/server';
import { Section } from '@/components/ui/Section';
import { StartKitchen } from '@/components/kitchen/StartKitchen';
import { publicEnv } from '@/lib/env';

export const metadata = { title: 'Open your kitchen' };
export default async function Start() {
  const { data } = await (await createClient()).auth.getUser();
  return (<Section><div className="mx-auto max-w-md"><h1 className="text-h1">Open your kitchen</h1>
    <p className="mb-6 mt-1 text-body text-ink-soft">Create an account, choose your web address, and start building your menu.</p>
    <StartKitchen rootDomain={publicEnv.rootDomain} signedInEmail={data.user?.email ?? null} /></div></Section>);
}
