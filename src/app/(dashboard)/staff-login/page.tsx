import { Section } from '@/components/ui/Section';
import { StaffLoginForm } from '@/components/kitchen/StaffAuth';

export const metadata = { title: 'Staff login', robots: { index: false, follow: false } };

export default function StaffLogin() {
  return (
    <Section className="flex flex-col items-center">
      <div className="mx-auto max-w-sm w-full">
        <h1 className="text-h1 text-ink-muted">Staff login</h1>
        <p className="mt-2 text-body-lg text-ink-muted/70">Sign in to your kitchen back office.</p>
        <div className="mt-6"><StaffLoginForm /></div>
      </div>
    </Section>
  );
}
