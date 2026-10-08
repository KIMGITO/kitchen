import 'server-only';

/** Transactional email via Resend. Returns false (never throws) so callers can fall back gracefully. */
export async function sendEmail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY; const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#161A17">${
    text.split('\n').map((l) => `<p style="margin:0 0 12px">${esc(l).replace(/(https?:\/\/[^\s"'<>]+)/g, '<a href="$1">$1</a>')}</p>`).join('')}</div>`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text, html }),
    });
    return res.ok;
  } catch { return false; }
}
