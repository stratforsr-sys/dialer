import { requireAuth } from "@/lib/auth";
import { ResearchPage } from "@/components/research/ResearchPage";

export default async function ResearchRoute() {
  await requireAuth();
  return <ResearchPage />;
}
