/**
 * Morgonmejlet med dagens återkomster.
 *
 * Mejlet ska kunna läsas på en telefon i bilen på väg in, och svara på en enda
 * fråga: vilka lovade jag att ringa idag, och när. Därför tid först, bolag
 * sedan, och anteckningen under — inte tvärtom. Missade ligger överst i rött,
 * eftersom ett brutet löfte är mer akut än ett som ännu inte förfallit.
 *
 * Bordslayout och inline-stilar: Gmail strippar <style>-block, Outlook
 * renderar med Word och kan inte flexbox. Det här är inte kod som ska likna
 * appens komponenter — det är kod som ska överleva sex e-postklienter.
 */

import { escapeHtml } from "@/lib/email/send";
import { formatTime, formatWhen } from "@/lib/time";

export interface ReminderRow {
  companyName: string;
  contactName: string | null;
  phone: string | null;
  scheduledAt: Date;
  note: string | null;
  /** Löftet förföll före idag och är fortfarande oringt. */
  overdue: boolean;
  leadUrl: string;
}

export interface ReminderEmail {
  subject: string;
  html: string;
  text: string;
}

const ACCENT = "#0B7F6E";
const DANGER = "#B42318";
const TEXT = "#101828";
const MUTED = "#667085";
const BORDER = "#E4E7EC";

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function callbackReminderEmail(params: {
  sellerName: string;
  rows: ReminderRow[];
  now: Date;
  appUrl: string;
}): ReminderEmail {
  const { sellerName, rows, now, appUrl } = params;

  const overdue = rows.filter((r) => r.overdue);
  const today = rows.filter((r) => !r.overdue);

  const subject =
    overdue.length > 0
      ? `${overdue.length} missad${overdue.length === 1 ? "" : "e"} återkomst${
          overdue.length === 1 ? "" : "er"
        } · ${today.length} idag`
      : `${today.length} ${plural(today.length, "återkomst", "återkomster")} idag`;

  const firstName = sellerName.split(" ")[0] || sellerName;

  // ── Text ────────────────────────────────────────────────────────────────
  const textLines: string[] = [`Hej ${firstName},`, ""];

  if (overdue.length > 0) {
    textLines.push(`MISSADE (${overdue.length}):`);
    for (const r of overdue) {
      textLines.push(
        `  ${formatWhen(r.scheduledAt, now)}  ${r.companyName}${
          r.contactName ? ` — ${r.contactName}` : ""
        }${r.phone ? ` — ${r.phone}` : ""}`
      );
      if (r.note) textLines.push(`      ${r.note}`);
    }
    textLines.push("");
  }

  if (today.length > 0) {
    textLines.push(`IDAG (${today.length}):`);
    for (const r of today) {
      textLines.push(
        `  ${formatTime(r.scheduledAt)}  ${r.companyName}${
          r.contactName ? ` — ${r.contactName}` : ""
        }${r.phone ? ` — ${r.phone}` : ""}`
      );
      if (r.note) textLines.push(`      ${r.note}`);
    }
    textLines.push("");
  }

  textLines.push(
    "Du får det här mejlet för att du kryssade i påminnelse när du bokade.",
    appUrl
  );

  // ── HTML ────────────────────────────────────────────────────────────────
  function rowHtml(r: ReminderRow): string {
    const color = r.overdue ? DANGER : ACCENT;
    const when = r.overdue ? formatWhen(r.scheduledAt, now) : formatTime(r.scheduledAt);

    return `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid ${BORDER};">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="72" valign="top" style="font:600 15px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${color};white-space:nowrap;">
                ${escapeHtml(when)}
              </td>
              <td valign="top" style="font:400 14px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
                <a href="${escapeHtml(r.leadUrl)}" style="color:${TEXT};text-decoration:none;font-weight:600;">${escapeHtml(
                  r.companyName
                )}</a>
                ${
                  r.contactName
                    ? `<div style="color:${MUTED};font-size:13px;margin-top:2px;">${escapeHtml(
                        r.contactName
                      )}</div>`
                    : ""
                }
                ${
                  r.note
                    ? `<div style="color:${MUTED};font-size:13px;margin-top:6px;white-space:pre-wrap;">${escapeHtml(
                        r.note
                      )}</div>`
                    : ""
                }
              </td>
              <td width="130" valign="top" align="right" style="font:400 13px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;white-space:nowrap;">
                ${
                  r.phone
                    ? `<a href="tel:${escapeHtml(r.phone)}" style="color:${ACCENT};text-decoration:none;">${escapeHtml(
                        r.phone
                      )}</a>`
                    : ""
                }
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }

  function section(title: string, color: string, list: ReminderRow[]): string {
    if (list.length === 0) return "";
    return `
      <tr>
        <td style="padding:18px 16px 8px;font:700 11px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;letter-spacing:0.08em;text-transform:uppercase;color:${color};">
          ${escapeHtml(title)}
        </td>
      </tr>
      ${list.map(rowHtml).join("")}`;
  }

  const html = `<!doctype html>
<html lang="sv">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F1F3F6;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#F1F3F6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:20px 16px 4px;font:600 18px/1.3 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
              Hej ${escapeHtml(firstName)}
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 4px;font:400 14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};">
              ${
                overdue.length > 0
                  ? `Du har <strong style="color:${DANGER};">${overdue.length} missad${
                      overdue.length === 1 ? "" : "e"
                    }</strong> och ${today.length} ${plural(today.length, "återkomst", "återkomster")} idag.`
                  : `Du har ${today.length} ${plural(today.length, "återkomst", "återkomster")} idag.`
              }
            </td>
          </tr>
          ${section(`Missade — ring först`, DANGER, overdue)}
          ${section(`Idag`, ACCENT, today)}
          <tr>
            <td style="padding:20px 16px;">
              <a href="${escapeHtml(appUrl)}" style="display:inline-block;background:${ACCENT};color:#FFFFFF;text-decoration:none;font:600 14px/1 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:12px 20px;border-radius:10px;">Öppna Sales Hub</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 16px 20px;font:400 12px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${MUTED};border-top:1px solid ${BORDER};padding-top:14px;">
              Du får det här mejlet för att du kryssade i <em>Påminn mig via mejl</em> när du bokade återkomsten. Kryssa ur rutan i bokningsrutan för att slippa det.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text: textLines.join("\n") };
}
