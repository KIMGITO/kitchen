/**
 * Permission keys mirror public.permissions in the database (the database is authoritative).
 * The UI uses these only to show/hide controls; every action is re-checked by RLS/RPC.
 */
export const PERMISSIONS = [
  'orders.view', 'orders.accept', 'orders.prepare', 'orders.complete', 'orders.cancel',
  'menu.view', 'menu.manage', 'customers.view', 'customers.manage',
  'payments.view', 'finance.view', 'reports.view',
  'staff.view', 'staff.manage', 'settings.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export class PermissionSet {
  constructor(private readonly granted: ReadonlySet<string>) {}
  static from(list: readonly string[] | null | undefined) { return new PermissionSet(new Set(list ?? [])); }
  can(p: Permission) { return this.granted.has(p); }
  canAny(...ps: Permission[]) { return ps.some((p) => this.granted.has(p)); }
  toArray() { return [...this.granted]; }
}
