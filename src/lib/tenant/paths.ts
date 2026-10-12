/**
 * Public routes that live at the app ROOT — outside the `/platform` and
 * `/platform-admin` route trees — and must therefore be served verbatim on every
 * host.
 *
 * `src/middleware.ts` rewrites all other paths into the area for the current host
 * (`/platform/...` on the root host, `/platform-admin/...` on the admin host).
 * These pages have no counterpart in either tree, so rewriting them would resolve
 * to a route that does not exist and hard-404. That is exactly what broke
 * `/forgot-password` and `/auth/callback` on `admin.example.com`, taking the
 * whole password-recovery flow down for platform admins.
 */
export const SHARED_PATHS = ['/forgot-password', '/reset-password', '/auth'] as const;

/** True for `/forgot-password` and `/auth/callback`, but not `/forgot-password-x`. */
export function isSharedPath(path: string): boolean {
  return SHARED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}
