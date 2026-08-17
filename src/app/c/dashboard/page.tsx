import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ClientDashboard } from "@/components/client-dashboard";
import { CLIENT_SESSION_COOKIE, verifyClientSession } from "@/lib/client-session";
import { getClientById, getSatisfactionScore, listProjectEvents, listProjectPlanItems } from "@/lib/plans-db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seu painel — Vizantu" };

export default async function ClientDashboardPage() {
  const cookieStore = await cookies();
  const clientId = verifyClientSession(cookieStore.get(CLIENT_SESSION_COOKIE)?.value);
  if (!clientId) redirect("/c/invalido");

  const client = await getClientById(clientId);
  if (!client) redirect("/c/invalido");

  const [items, events, score] = await Promise.all([
    listProjectPlanItems(client.projectId),
    listProjectEvents(client.projectId),
    getSatisfactionScore(client.projectId),
  ]);

  return (
    <ClientDashboard
      clientName={client.name}
      roleTitle={client.roleTitle}
      city={client.city}
      instagramHandle={client.instagramHandle}
      initialItems={items}
      events={events}
      initialScore={score}
    />
  );
}
