import { headers } from "next/headers";
import { AdminShell } from "@/components/admin-shell";
import { Dashboard } from "@/components/dashboard";
import { listApprovalSummaries, listPlans } from "@/lib/storage";
import type { ApprovalSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || (host ? `${protocol}://${host}` : "");
  let plans: Awaited<ReturnType<typeof listPlans>> = [];
  let approvalSummaries: Record<string, ApprovalSummary> = {};
  let storageError = "";

  try {
    plans = await listPlans();
    approvalSummaries = await listApprovalSummaries(plans);
  } catch (error) {
    console.error("Falha ao acessar o armazenamento", error);
    storageError = "O painel está aberto, mas o armazenamento ainda não foi conectado. Verifique as variáveis do armazenamento na VPS.";
  }

  return (
    <AdminShell active="plans">
      <Dashboard initialPlans={plans} initialSummaries={approvalSummaries} siteUrl={siteUrl.replace(/\/$/, "")} storageError={storageError} />
    </AdminShell>
  );
}
