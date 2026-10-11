// Shared Flutterwave V3 client for Edge Functions (Deno).
// No npm deps: plain fetch against https://api.flutterwave.com/v3.

export const FW_BASE = "https://api.flutterwave.com/v3";

export function fwSecret(): string {
  const key = Deno.env.get("FLUTTERWAVE_SECRET_KEY") ?? "";
  if (!key) throw new Error("FLUTTERWAVE_SECRET_KEY is not set");
  return key;
}

export interface FwResult<T = unknown> {
  ok: boolean;
  status: string;
  message: string;
  data: T | null;
  rawStatus: number;
}

/** POST/GET helper with the secret bearer token. Never logs the key. */
export async function fwFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<FwResult<T>> {
  const res = await fetch(`${FW_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${fwSecret()}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let json: { status?: string; message?: string; data?: T } = {};
  try {
    json = await res.json();
  } catch {
    /* non-JSON upstream body */
  }
  return {
    ok: res.ok && json.status === "success",
    status: String(json.status ?? (res.ok ? "success" : "error")),
    message: String(json.message ?? `Flutterwave error (HTTP ${res.status})`),
    data: (json.data ?? null) as T | null,
    rawStatus: res.status,
  };
}

/**
 * Webhook verification. In the Flutterwave dashboard set the webhook "Secret Hash";
 * every event arrives with that value in the `verif-hash` header.
 */
export function verifyWebhook(req: Request): boolean {
  const expected = Deno.env.get("FLUTTERWAVE_SECRET_HASH")
    ?? Deno.env.get("FLUTTERWAVE_WEBHOOK_SECRET")
    ?? "";
  if (!expected) return false;
  const got = req.headers.get("verif-hash") ?? "";
  return got.length > 0 && got === expected;
}

/** Minor units (cents) -> Flutterwave major units string, e.g. 125050 -> "1250.50". */
export const minorToMajor = (minor: number): string => (minor / 100).toFixed(2);

/** Standard JSON envelope used by all Flutterwave functions. */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Minimal CORS for browser-invoked functions (checkout-init). */
export function cors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, apikey",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  return null;
}

export function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(res.body, { status: res.status, headers });
}
