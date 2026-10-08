import { requirePermission } from '@/lib/auth/session';
import { getTenant } from '@/lib/tenant/get-tenant';
import { getEntitlements } from '@/lib/auth/entitlements';
import { createClient } from '@/lib/supabase/server';
import { ActionForm } from '@/components/ui/ActionForm';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { inviteStaff, revokeInvitation, updateStaff } from '@/lib/actions/kitchen';

const ROLES = [['kitchen_admin', 'Kitchen admin'], ['manager', 'Manager'], ['cashier', 'Cashier'], ['worker', 'Kitchen worker']] as const;

export default async function StaffPage() {
  const { perms, user } = await requirePermission('staff.view');
  const [tenant, ent] = await Promise.all([getTenant(), getEntitlements()]);
  const supabase = await createClient();
  const [{ data: staff }, { data: invites }] = await Promise.all([
    supabase.rpc('list_staff', { p_tenant: tenant.id }),
    supabase.from('tenant_invitations').select('id, email, role_key, expires_at').eq('tenant_id', tenant.id).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
  ]);
  const manage = perms.can('staff.manage'); const limit = ent.getLimit('max_staff');
  const members = (staff ?? []) as { member_id: string; user_id: string; email: string; full_name: string | null; role_key: string; is_active: boolean }[];

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-h1 text-ink-muted">Staff</h1>
      <p className="text-body text-ink-muted/70">{members.filter((m) => m.is_active).length} active{limit === null ? '' : ` of ${limit} allowed on your plan`}.</p>

      {(members ?? []).length === 0 ? <p className="text-body text-ink-muted/70">No staff members yet.</p> : (
        <ul className="divide-y divide-line">
          {(members ?? []).map((m) => (
            <li key={m.member_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="text-label text-ink-muted">{m.full_name ?? m.email}{m.user_id === user?.id ? ' (you)' : ''}</p>
                <p className="text-caption text-ink-muted/70">{m.email}{m.is_active ? '' : ' • deactivated'}</p>
              </div>
              {manage ? (
                <div className="flex flex-wrap items-center gap-2">
                  <form action={updateStaff} className="flex items-center gap-2">
                    <input type="hidden" name="member" value={m.member_id} />
                    <label className="sr-only" htmlFor={`r-${m.member_id}`}>Role</label>
                    <select id={`r-${m.member_id}`} name="role" defaultValue={m.role_key} className="h-11 rounded-md border border-line bg-surface px-2 text-body text-ink-muted">
                      {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                    <input type="hidden" name="active" value={String(m.is_active)} />
                    <Button type="submit" size="sm" variant="outline">Change role</Button>
                  </form>
                  <form action={updateStaff}>
                    <input type="hidden" name="member" value={m.member_id} />
                    <input type="hidden" name="role" value={m.role_key} />
                    <input type="hidden" name="active" value={String(!m.is_active)} />
                    <Button type="submit" size="sm" variant={m.is_active ? 'ghost' : 'primary'}>{m.is_active ? 'Deactivate' : 'Reactivate'}</Button>
                  </form>
                </div>
              ) : <span className="text-label text-ink-muted">{ROLES.find(([k]) => k === m.role_key)?.[1]}</span>}
            </li>
          ))}
        </ul>
      )}

      {manage ? (
        <>
          <section aria-labelledby="inv-h" className="flex flex-col gap-3">
            <h2 id="inv-h" className="text-h2 text-ink-muted">Invite someone</h2>
            <ActionForm action={inviteStaff} submitLabel="Create invitation" className="flex flex-col gap-4">
              <Input label="Email" name="email" type="email" required />
              <label className="flex flex-col gap-1.5">
                <span className="text-label text-ink-muted">Role</span>
                <select name="role" defaultValue="worker" className="h-11 rounded-md border border-line bg-surface px-3 text-body text-ink-muted">
                  {ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
            </ActionForm>
            <p className="text-caption text-ink-muted/60">Invitations are shared as a link; they are not emailed yet. Each link works once and expires in 7 days.</p>
          </section>

          {(invites ?? []).length > 0 ? (
            <section aria-labelledby="pend-h">
              <h2 id="pend-h" className="mb-2 text-h2 text-ink-muted">Pending invitations</h2>
              <ul className="divide-y divide-line">
                {(invites ?? []).map((i: { id: string; email: string; role_key: string }) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      {i.email} <span className="text-caption text-ink-muted/70">as {ROLES.find(([k]) => k === i.role_key)?.[1]}</span>
                    </span>
                    <form action={revokeInvitation}>
                      <input type="hidden" name="id" value={i.id} />
                      <Button type="submit" size="sm" variant="ghost">Revoke</Button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
