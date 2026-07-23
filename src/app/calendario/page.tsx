import { AdminShell } from "@/components/admin-shell";
import { PlanCalendar } from "@/components/plan-calendar";
import { loadDashboardProjects } from "@/lib/admin-data";
import type { DashboardProject } from "@/lib/admin-analytics";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  let projects: DashboardProject[] = [];
  let storageError = "";

  try {
    projects = await loadDashboardProjects();
  } catch (error) {
    console.error("Falha ao montar o calendário administrativo", error);
    storageError = "O calendário está disponível, mas não foi possível carregar os dados do armazenamento agora.";
  }

  return (
    <AdminShell active="calendar">
      <PlanCalendar projects={projects} storageError={storageError} />
    </AdminShell>
  );
}
