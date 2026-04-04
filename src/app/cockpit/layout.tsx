import { requireAuth } from "@/lib/auth";

// Cockpit is fullscreen — no sidebar
export default async function CockpitLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  return <>{children}</>;
}
