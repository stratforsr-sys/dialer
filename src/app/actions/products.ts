"use server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export async function getProducts() {
  return db.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
}

export async function getAllProducts() {
  await requireAdmin();
  return db.product.findMany({ orderBy: { name: "asc" } });
}

export async function createProduct(data: {
  name: string;
  description?: string | null;
  basePrice?: number | null;
  isRecurring?: boolean;
  unit?: string | null;
}) {
  await requireAdmin();
  await db.product.create({ data });
  revalidatePath("/admin");
}

export async function updateProduct(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    basePrice?: number | null;
    isRecurring?: boolean;
    unit?: string | null;
    active?: boolean;
  }
) {
  await requireAdmin();
  await db.product.update({ where: { id }, data });
  revalidatePath("/admin");
}

export async function deleteProduct(id: string) {
  await requireAdmin();
  // Soft delete — deactivate so deal history is preserved
  await db.product.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
}
