import { Section } from '@/components/ui/Section';
import { StaffLoginForm } from '@/components/kitchen/StaffAuth';
export const metadata = { title: 'Platform admin login', robots: { index: false, follow: false } };
export default function AdminLogin() {
  // `/login` (not `/platform-admin/login`): middleware 404s the internal prefix on
  // every host, and on the admin host `/login` rewrites here anyway. The value is
  // carried into the password-recovery flow, so it must be a path that resolves.
  return (<Section><div className="mx-auto max-w-sm"><h1 className="text-h1">Platform admin</h1><div className="mt-6"><StaffLoginForm next="/" loginPath="/login" /></div></div></Section>);
}
