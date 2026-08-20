import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

/**
 * Kontot som bär historiken efter raderade användare.
 *
 * Nio tabeller pekar på `User` med `ON DELETE RESTRICT` — samtal, pass,
 * återkomster, affärer, aktiviteter, listor, manus. Att kaskadradera dem hade
 * raderat företagets samtalshistorik tillsammans med personen, och att peka om
 * dem på den admin som råkar trycka på knappen hade skrivit 629 samtal på fel
 * namn. Gravstenskontot är tredje vägen: raden för personen försvinner på
 * riktigt, historiken ligger kvar och redovisas som "Borttagen användare".
 *
 * Priset är medvetet: raderar du två säljare hamnar båda i samma hink, och
 * vem av dem som ringde ett visst samtal går inte längre att se. Det är
 * avvägningen mot att inte förlora samtalen alls.
 */
export const SYSTEM_USER_EMAIL = "borttagen@system.invalid";
export const SYSTEM_USER_NAME = "Borttagen användare";

/**
 * Hämtar gravstenskontot och skapar det första gången någon raderas.
 *
 * Lösenordshashen är en riktig bcrypt-hash av ett slumptal ingen har sett.
 * Kontot går alltså inte att logga in på, men `bcrypt.compare` får ändå en
 * välformad hash att arbeta mot i stället för skräp — en inloggning mot det
 * här kontot ska svara "fel lösenord", inte krascha.
 *
 * `.invalid` är reserverat av RFC 2606 och kan aldrig existera som domän.
 * E-posten är en nyckel, inte en adress.
 */
export async function getOrCreateSystemUser(): Promise<{ id: string }> {
  const existing = await db.user.findUnique({
    where: { email: SYSTEM_USER_EMAIL },
    select: { id: true },
  });
  if (existing) return existing;

  try {
    return await db.user.create({
      data: {
        email: SYSTEM_USER_EMAIL,
        name: SYSTEM_USER_NAME,
        role: "SELLER",
        passwordHash: await bcrypt.hash(randomUUID(), 12),
      },
      select: { id: true },
    });
  } catch {
    // Två admins som raderar samtidigt: den unika e-posten avgör vem som
    // vann, och förloraren läser bara om raden.
    const raced = await db.user.findUnique({
      where: { email: SYSTEM_USER_EMAIL },
      select: { id: true },
    });
    if (!raced) throw new Error("Kunde inte skapa systemkontot för raderade användare");
    return raced;
  }
}
