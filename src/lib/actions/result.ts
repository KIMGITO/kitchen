export type ActionResult = { ok: true; message?: string; data?: Record<string, string> } | { ok: false; error: string };
export const ok = (message?: string, data?: Record<string, string>): ActionResult => ({ ok: true, message, data });
export const fail = (error: string): ActionResult => ({ ok: false, error });
