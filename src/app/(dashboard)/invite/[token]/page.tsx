import { getTenant } from '@/lib/tenant/get-tenant';
import { getUser } from '@/lib/auth/session';
import { Section } from '@/components/ui/Section';
import { InviteAccept } from '@/components/kitchen/StaffAuth';

export const metadata = { title: 'Join the team', robots: { index: false, follow: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const [{ token }, tenant, user] = await Promise.all([params, getTenant(), getUser()]);
  return (
    <Section className="flex flex-col items-center">
      <div className="mx-auto max-w-sm w-full text-center">
        <h1 className="text-h1 text-ink-muted">Join {tenant.name}</h1>
        <p className="mb-6 mt-1 text-body-lg text-ink-soft">You have been invited to work in this kitchen's back office.</p>
        <InviteAccept token={token} tenantName={tenant.name} signedInEmail={user?.email ?? null} />
      </div>
    </Section>
  );
}
