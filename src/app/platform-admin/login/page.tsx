import { Section } from '@/components/ui/Section';
import { StaffLoginForm } from '@/components/kitchen/StaffAuth';
export const metadata = { title: 'Platform admin login', robots: { index: false, follow: false } };
export default function AdminLogin() {
  return (<Section><div className="mx-auto max-w-sm"><h1 className="text-h1">Platform admin</h1><div className="mt-6"><StaffLoginForm next="/" /></div></div></Section>);
}
