import type { ApprovalStatus, PlanApprovals } from "@/lib/types";

// Resultado de um conteúdo dentro de uma versão específica.
// "carried" nunca aparece na lista: itens já resolvidos em versões anteriores
// (aprovados ou reprovados) simplesmente saem de cena e não contam mais.
export type VersionItemOutcome = "approved" | "changes_requested" | "rejected" | "pending";

export type VersionItem = {
  id: string;
  title: string;
  outcome: VersionItemOutcome;
  comment?: string;
  approverName?: string;
  updatedAt?: string;
};

export type VersionBreakdown = {
  version: number;
  total: number;
  approved: number;
  changesRequested: number;
  rejected: number;
  pending: number;
  carriedIn: number; // conteúdos que já vinham resolvidos de versões anteriores
  items: VersionItem[];
  isCurrent: boolean;
};

// Estados terminais: uma vez aqui, o conteúdo sai da fila e não volta na próxima versão.
const TERMINAL: ReadonlySet<ApprovalStatus> = new Set<ApprovalStatus>(["approved", "rejected"]);

function outcomeFromStatus(status: ApprovalStatus): VersionItemOutcome {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "changes_requested") return "changes_requested";
  return "pending";
}

type Decision = { status: ApprovalStatus; at: string; comment: string; approverName?: string };

/**
 * Reconstrói a linha do tempo por versão a partir do histórico de eventos.
 * Cada evento já carrega `reviewVersion`, então dá para saber, versão a versão,
 * quantos conteúdos entraram e como cada um foi resolvido — sem alterar o armazenamento.
 */
export function buildVersionTimeline(approvals: PlanApprovals, currentVersion: number): VersionBreakdown[] {
  const items = approvals.items || [];
  const history = approvals.history || [];

  const maxVersion = Math.max(
    currentVersion || 1,
    approvals.reviewVersion || 1,
    ...history.map((event) => event.reviewVersion || 1),
  );

  // Título + estado agregado atual de cada conteúdo (fallback para dados legados sem eventos).
  const meta = new Map<string, { title: string; currentStatus: ApprovalStatus }>();
  for (const item of items) meta.set(item.id, { title: item.title, currentStatus: item.status });
  for (const event of history) {
    if (!meta.has(event.itemId)) meta.set(event.itemId, { title: event.itemTitle, currentStatus: "pending" });
  }

  // Última decisão de cada conteúdo em cada versão (o evento mais recente vence).
  const decisions = new Map<string, Map<number, Decision>>();
  for (const event of history) {
    const version = event.reviewVersion || 1;
    const byVersion = decisions.get(event.itemId) || new Map<number, Decision>();
    const previous = byVersion.get(version);
    if (!previous || previous.at <= event.createdAt) {
      byVersion.set(version, {
        status: event.status,
        at: event.createdAt,
        comment: event.comment || "",
        approverName: event.approverName,
      });
    }
    decisions.set(event.itemId, byVersion);
  }

  const terminatedBefore = (id: string, version: number) => {
    const byVersion = decisions.get(id);
    if (!byVersion) return false;
    for (const [decisionVersion, decision] of byVersion) {
      if (decisionVersion < version && TERMINAL.has(decision.status)) return true;
    }
    return false;
  };

  const breakdowns: VersionBreakdown[] = [];

  for (let version = 1; version <= maxVersion; version += 1) {
    const versionItems: VersionItem[] = [];
    let carriedIn = 0;

    for (const [id, info] of meta) {
      if (terminatedBefore(id, version)) {
        carriedIn += 1;
        continue;
      }

      const decision = decisions.get(id)?.get(version);
      let outcome: VersionItemOutcome;
      let comment = "";
      let approverName: string | undefined;
      let updatedAt: string | undefined;

      if (decision) {
        outcome = outcomeFromStatus(decision.status);
        comment = decision.comment;
        approverName = decision.approverName;
        updatedAt = decision.at;
      } else if (version === currentVersion) {
        // Sem evento nesta versão: usa o estado agregado atual (cobre dados legados
        // e a aprovação automática por prazo, que não gera evento).
        outcome = approvals.autoApproved ? "approved" : outcomeFromStatus(info.currentStatus);
      } else {
        outcome = "pending";
      }

      versionItems.push({ id, title: info.title, outcome, comment, approverName, updatedAt });
    }

    if (!versionItems.length && version !== currentVersion) continue;

    breakdowns.push({
      version,
      total: versionItems.length,
      approved: versionItems.filter((item) => item.outcome === "approved").length,
      changesRequested: versionItems.filter((item) => item.outcome === "changes_requested").length,
      rejected: versionItems.filter((item) => item.outcome === "rejected").length,
      pending: versionItems.filter((item) => item.outcome === "pending").length,
      carriedIn,
      items: versionItems,
      isCurrent: version === currentVersion,
    });
  }

  return breakdowns;
}
