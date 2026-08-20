"use server";

import { db } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { getOrCreateSystemUser, SYSTEM_USER_EMAIL, SYSTEM_USER_NAME } from "@/lib/system-user";

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "SELLER";
}) {
  await requireAdmin();
  if (data.email.trim().toLowerCase() === SYSTEM_USER_EMAIL) {
    throw new Error("Den adressen är reserverad för systemet");
  }
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await db.user.create({
    data: { name: data.name, email: data.email.toLowerCase(), passwordHash, role: data.role },
  });
  revalidatePath("/admin");
  return user;
}

// ─── Radera konto ────────────────────────────────────────────────────────────
// Ett rakt `db.user.delete` går inte. Nio tabeller pekar på User med
// ON DELETE RESTRICT — ett enda samtal, pass eller lista räcker för att
// databasen ska vägra, och vägran nådde skärmen som "Application error".
// Historiken flyttas därför till gravstenskontot innan raden tas bort.
// Se `lib/system-user.ts` för varför just den lösningen.

/** Vad som händer om kontot raderas. Läses innan bekräftelsen visas — en
 *  raderingsknapp som inte säger vad den river är samma sak som ingen
 *  bekräftelse alls. */
export type UserDeletionImpact = {
  id: string;
  name: string;
  email: string;
  isSelf: boolean;
  isSystem: boolean;
  isLastAdmin: boolean;
  calls: number;
  sessions: number;
  callbacksOpen: number;
  callbacksTotal: number;
  deals: number;
  activities: number;
  lists: number;
  scripts: number;
  /** Bolag där personen står som "senast bearbetad av". */
  leads: number;
  /** Av dem: bolag med levande claim, som släpps tillbaka i rotationen. */
  claims: number;
  /** Parkeringar i dialern som släpps. */
  leases: number;
};

async function loadDeletionImpact(id: string, adminId: string): Promise<UserDeletionImpact> {
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!target) throw new Error("Användaren finns inte");

  const now = new Date();

  const [
    calls, sessions, callbacksOpen, callbacksTotal, deals, activities,
    lists, scripts, leads, claims, leases, otherAdmins,
  ] = await Promise.all([
    db.callAttempt.count({ where: { sellerId: id } }),
    db.callSession.count({ where: { userId: id } }),
    db.callback.count({ where: { sellerId: id, status: "PENDING" } }),
    db.callback.count({ where: { sellerId: id } }),
    db.deal.count({ where: { createdById: id } }),
    db.activity.count({ where: { actorId: id } }),
    db.callList.count({ where: { createdById: id } }),
    db.scriptTemplate.count({ where: { createdById: id } }),
    db.lead.count({ where: { ownerId: id } }),
    db.lead.count({ where: { ownerId: id, claimedAt: { not: null } } }),
    db.lead.count({ where: { leasedById: id, leasedUntil: { gt: now } } }),
    db.user.count({ where: { role: "ADMIN", id: { not: id }, email: { not: SYSTEM_USER_EMAIL } } }),
  ]);

  return {
    id: target.id,
    name: target.name,
    email: target.email,
    isSelf: id === adminId,
    isSystem: target.email === SYSTEM_USER_EMAIL,
    isLastAdmin: target.role === "ADMIN" && otherAdmins === 0,
    calls, sessions, callbacksOpen, callbacksTotal, deals, activities,
    lists, scripts, leads, claims, leases,
  };
}

export async function getUserDeletionImpact(id: string): Promise<UserDeletionImpact> {
  const admin = await requireAdmin();
  return loadDeletionImpact(id, admin.id);
}

export async function deleteUser(id: string) {
  const admin = await requireAdmin();
  const impact = await loadDeletionImpact(id, admin.id);

  if (impact.isSelf) throw new Error("Du kan inte ta bort dig själv");
  if (impact.isSystem) {
    throw new Error(`"${SYSTEM_USER_NAME}" bär historiken efter redan raderade konton och kan inte tas bort`);
  }
  if (impact.isLastAdmin) {
    throw new Error("Det måste finnas minst en admin kvar — gör någon annan till admin först");
  }

  const ghost = await getOrCreateSystemUser();

  // Ordningen är inte kosmetisk: claims letas upp på `ownerId`, så de måste
  // släppas innan `ownerId` byter hand. Samma sak med återkomsterna — de
  // öppna plockas ut först, resten sveps med i steget efter.
  await db.$transaction([
    // Parkeringar i dialern. Bara en kolumn utan främmande nyckel, så
    // databasen städar inte åt oss: utan det här pekar ett lås på ett id som
    // inte finns och bolaget ligger otillgängligt tills leasen går ut.
    db.lead.updateMany({
      where: { leasedById: id },
      data: { leasedById: null, leasedUntil: null },
    }),
    // Claim-låset släpps. Ett bolag ska inte stå reserverat i sextio dagar
    // åt någon som inte längre finns — det ska tillbaka i rotationen.
    db.lead.updateMany({
      where: { ownerId: id, claimedAt: { not: null } },
      data: { claimedAt: null },
    }),
    // Öppna återkomster är löften till kunder, inte historik. De går till den
    // admin som raderar; på gravstenskontot hade ingen sett dem igen.
    db.callback.updateMany({
      where: { sellerId: id, status: "PENDING" },
      data: { sellerId: admin.id },
    }),

    // Resten är historik och flyttas oförändrad till gravstenen.
    db.callback.updateMany({ where: { sellerId: id }, data: { sellerId: ghost.id } }),
    db.callAttempt.updateMany({ where: { sellerId: id }, data: { sellerId: ghost.id } }),
    db.activity.updateMany({ where: { actorId: id }, data: { actorId: ghost.id } }),
    db.callSession.updateMany({ where: { userId: id }, data: { userId: ghost.id } }),
    db.deal.updateMany({ where: { createdById: id }, data: { createdById: ghost.id } }),
    db.callList.updateMany({ where: { createdById: id }, data: { createdById: ghost.id } }),
    db.scriptTemplate.updateMany({ where: { createdById: id }, data: { createdById: ghost.id } }),
    db.doNotCall.updateMany({ where: { addedById: id }, data: { addedById: ghost.id } }),
    db.telephonyCall.updateMany({ where: { userId: id }, data: { userId: ghost.id } }),
    // `ownerId` betyder "senast bearbetad av", inte ägarskap. Bolagen är
    // företagets, inte säljarens, och raderas aldrig.
    db.lead.updateMany({ where: { ownerId: id }, data: { ownerId: ghost.id } }),

    // Kvar hänger bara det databasen städar själv: ListAccess och
    // SellerPresence kaskadraderas, TelephonyAgent nollställs — anknytningen i
    // växeln tillhör inte längre någon.
    db.user.delete({ where: { id } }),
  ]);

  revalidatePath("/admin");
  return impact;
}

export async function updateUserRole(id: string, role: "ADMIN" | "SELLER") {
  const admin = await requireAdmin();
  if (id === admin.id) throw new Error("Du kan inte ändra din egen roll");
  const target = await db.user.findUnique({ where: { id }, select: { email: true } });
  if (target?.email === SYSTEM_USER_EMAIL) {
    throw new Error(`"${SYSTEM_USER_NAME}" är inget riktigt konto och kan inte få en roll`);
  }
  await db.user.update({ where: { id }, data: { role } });
  revalidatePath("/admin");
}

// ─── Säljarens egna inställningar ────────────────────────────────────────────
// Skiljer sig från funktionerna ovan på en enda men avgörande punkt: de här
// tar aldrig emot ett id. Vem som ändras avgörs av sessionen, inte av vad
// klienten skickar. En säljare kan därför inte byta någon annans lösenord
// genom att gissa ett id.

/** Namnet i ett fält. Sätts som säljaren skriver det — ingen uppdelning i
 *  för- och efternamn, eftersom en automatisk delning ger fel svar på
 *  mellannamn och dubbla efternamn och inte går att ångra. */
export async function updateOwnName(name: string) {
  const user = await requireAuth();
  const trimmed = name.trim().replace(/\s+/g, " ");

  if (trimmed.length < 2) throw new Error("Namnet måste vara minst två tecken");
  if (trimmed.length > 80) throw new Error("Namnet får vara högst 80 tecken");

  await db.user.update({ where: { id: user.id }, data: { name: trimmed } });
  revalidatePath("/", "layout");
  return { name: trimmed };
}

/** Lösenordsbyte. Kräver nuvarande lösenord — utan det räcker en obevakad
 *  skärm för att låsa ute någon ur sitt eget konto. */
export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const session = await requireAuth();

  if (newPassword.length < 8) throw new Error("Nytt lösenord måste vara minst 8 tecken");
  if (newPassword === currentPassword) throw new Error("Nytt lösenord måste skilja sig från det gamla");

  const user = await db.user.findUnique({
    where: { id: session.id },
    select: { passwordHash: true },
  });
  if (!user) throw new Error("Användaren finns inte");

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw new Error("Nuvarande lösenord stämmer inte");

  // Samma kostnad som createUser använder. Avviker de åt går hashar från de
  // två vägarna att skilja åt på längden.
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await db.user.update({ where: { id: session.id }, data: { passwordHash } });
}
