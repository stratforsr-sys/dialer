"use server";

import { db } from "@/lib/db";
import { requireAdmin, requireAuth } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: "ADMIN" | "SELLER";
}) {
  await requireAdmin();
  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await db.user.create({
    data: { name: data.name, email: data.email.toLowerCase(), passwordHash, role: data.role },
  });
  revalidatePath("/admin");
  return user;
}

export async function deleteUser(id: string) {
  const admin = await requireAdmin();
  if (id === admin.id) throw new Error("Du kan inte ta bort dig själv");
  await db.user.delete({ where: { id } });
  revalidatePath("/admin");
}

export async function updateUserRole(id: string, role: "ADMIN" | "SELLER") {
  const admin = await requireAdmin();
  if (id === admin.id) throw new Error("Du kan inte ändra din egen roll");
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
