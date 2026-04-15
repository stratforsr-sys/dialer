import { getModulesWithProgress } from "@/actions/modules";
import { ModulesClient } from "@/components/modules/modules-client";

const USER_ID = "default-user";

export default async function ModulesPage() {
  const modules = await getModulesWithProgress(USER_ID);
  return <ModulesClient modules={modules} />;
}
