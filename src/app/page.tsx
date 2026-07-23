import { AdminShell } from "@/components/admin-shell";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { buildDashboardProjects } from "@/lib/admin-analytics";
import { loadDashboardProjects } from "@/lib/admin-data";

export const dynamic = "force-dynamic";

export default async function Home() {
  let projects: ReturnType<typeof buildDashboardProjects> = [];
  let storageError = "";

  try {
    projects = await loadDashboardProjects();
  } catch (error) {
    console.error("Falha ao montar o dashboard administrativo", error);
    storageError = "O dashboard está disponível, mas não foi possível carregar os dados do armazenamento agora.";
  }

  return (
    <AdminShell active="dashboard">
      <AnalyticsDashboard projects={projects} storageError={storageError} />
    </AdminShell>
  );
}
