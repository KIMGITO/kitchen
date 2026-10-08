import { ErrorState } from '@/components/ui/EmptyState';
export default function Forbidden() {
  return <ErrorState title="You don't have access to this page" description="Ask a kitchen admin to update your role if you need it." />;
}
