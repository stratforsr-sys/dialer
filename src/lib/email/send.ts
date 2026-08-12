/**
 * Utgående e-post via Resend.
 *
 * Ett `fetch` mot ett REST-API och ingen SDK: hela ytan vi använder är en POST
 * med fyra fält, och en dependency till hade behövt underhållas för det.
 *
 * Funktionen kastar aldrig. Ett mejl som inte går fram får sänka ett samtal
 * lika lite som en trasig anrikning får stoppa ringandet — anroparen får
 * `{ sent: false, error }` och bestämmer själv om det är värt att bry sig om.
 * Saknas nyckeln är det inte ett fel utan ett tillstånd: funktionen är
 * avstängd, och den ska gå att köra i en miljö där den är det.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface EmailResult {
  sent: boolean;
  id?: string;
  error?: string;
  /** Nyckel eller avsändare saknas — funktionen är avstängd, inte trasig. */
  disabled?: boolean;
}

/** Avsändaren, t.ex. `Sales Hub <noreply@clicknet.se>`. */
function from(): string | null {
  const addr = process.env.EMAIL_FROM?.trim();
  if (!addr) return null;
  return addr.includes("<") ? addr : `Sales Hub <${addr}>`;
}

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && from());
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const sender = from();

  if (!key || !sender) {
    return {
      sent: false,
      disabled: true,
      error: "RESEND_API_KEY eller EMAIL_FROM saknas",
    };
  }

  try {
    // Tio sekunder: jobbet som anropar har ett tak på 60, och en leverantör
    // som hänger sig får inte äta upp hela körningen så att resten av
    // säljarna blir utan sitt mejl.
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Resend svarar med JSON även på fel, men inte alltid — en 502 från
      // deras kant är HTML, och res.json() hade kastat mitt i felhanteringen.
      const body = await res.text();
      return { sent: false, error: `Resend ${res.status}: ${body.slice(0, 300)}` };
    }

    const data = (await res.json()) as { id?: string };
    return { sent: true, id: data.id };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : "Okänt fel vid utskick",
    };
  }
}

/** Minimal escaping för fritext som går in i HTML-mallarna. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
