"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
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
