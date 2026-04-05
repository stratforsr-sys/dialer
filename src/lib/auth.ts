import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { redirect } from "next/navigation";

export async function getSession() {
  return getServerSession(authOptions);
}

/** Use in Server Components / Actions — redirects to /login if not authenticated */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user as { id: string; email: string; name: string; role: string };
}

/** Returns true if the current user is an admin */
export async function isAdmin() {
  const user = await requireAuth();
  return user.role === "ADMIN";
}

/** Use in Server Actions — throws if not admin */
export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: admin only");
  }
  return user;
}
