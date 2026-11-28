// E-posta gönderimi: Brevo'nun HTTPS API'si (Render'ın ücretsiz planı SMTP portlarını kapattığı için SMTP değil).
// BREVO_API_KEY ve MAIL_FROM yoksa mail gönderilmez, link sunucu günlüğüne yazılır (yerel deneme için).

export interface Mail {
  to: string;
  subject: string;
  /** Düğmenin üstündeki paragraflar */
  lines: string[];
  button: { text: string; url: string };
  /** Düğmenin altındaki küçük not */
  footer?: string;
}

export function mailConfigured(): boolean {
  return !!(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function render(m: Mail): { html: string; text: string } {
  const html = `<!doctype html><html lang="tr"><body style="margin:0;background:#f3e7d3;font-family:Arial,Helvetica,sans-serif;color:#2b2018">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffaf1;border:3px solid #2b2018;border-radius:18px">
<tr><td style="background:#9a5f2e;border-radius:15px 15px 0 0;padding:18px 24px;color:#fff;font-size:24px;font-weight:bold">Yüzbir</td></tr>
<tr><td style="padding:24px">
${m.lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5">${esc(l)}</p>`).join('\n')}
<p style="margin:22px 0"><a href="${esc(m.button.url)}" style="display:inline-block;background:#57bd5f;color:#1d2b12;border:3px solid #2b2018;border-radius:12px;padding:12px 22px;font-size:17px;font-weight:bold;text-decoration:none">${esc(m.button.text)}</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#6b5a4b">Düğme çalışmazsa bu linki tarayıcına yapıştır:<br><span style="word-break:break-all">${esc(m.button.url)}</span></p>
${m.footer ? `<p style="margin:14px 0 0;font-size:13px;color:#6b5a4b">${esc(m.footer)}</p>` : ''}
</td></tr></table></td></tr></table></body></html>`;
  const text = [...m.lines, '', `${m.button.text}: ${m.button.url}`, '', m.footer ?? ''].join('\n').trim();
  return { html, text };
}

export async function sendMail(m: Mail): Promise<void> {
  if (!mailConfigured()) {
    console.log(`[mail] BREVO_API_KEY/MAIL_FROM yok, gönderilmedi → ${m.to} | ${m.subject} | ${m.button.url}`);
    return;
  }
  const { html, text } = render(m);
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': process.env.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || 'Yüzbir' },
      to: [{ email: m.to }],
      subject: m.subject,
      htmlContent: html,
      textContent: text,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  }
}
