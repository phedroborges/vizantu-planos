import { planClientName } from "@/lib/plan-client";
import type { Plan, PlanApprovals } from "@/lib/types";

export type DashboardAdjustment = {
  id: string;
  comment: string;
  itemTitle: string;
  createdAt: string;
};

export type DashboardViewer = {
  reviewerId: string;
  name: string;
  firstViewedAt: string;
  lastViewedAt: string;
  viewCount: number;
};

export type DashboardProject = {
  slug: string;
  title: string;
  client: string;
  kind: Plan["kind"];
  createdAt: string;
  updatedAt: string;
  reviewVersion: number;
  total: number;
  approved: number;
  changesRequested: number;
  pending: number;
  approvalRate: number;
  approvers: string[];
  viewers: DashboardViewer[];
  status: "approved" | "adjustments" | "review" | "pending" | "presentation";
  adjustments: DashboardAdjustment[];
};

export type AdjustmentCategory = {
  id: string;
  label: string;
  count: number;
  examples: string[];
};

type AdjustmentCategoryDefinition = {
  id: string;
  label: string;
  terms: readonly string[];
};

const ADJUSTMENT_CATEGORIES = [
  {
    id: "visual",
    label: "Visual e identidade",
    terms: [
      "imagem", "imagens", "foto", "fotos", "cor", "cores", "layout", "layouts",
      "arte", "artes", "logo", "logos", "fonte", "fontes", "design", "visual",
      "identidade visual", "paleta", "tipografia",
    ],
  },
  {
    id: "copy",
    label: "Texto e copy",
    terms: [
      "texto", "textos", "legenda", "legendas", "copy", "chamada", "chamadas",
      "titulo", "titulos", "frase", "frases", "escrita", "ortografia", "palavra",
      "palavras", "redacao",
    ],
  },
  {
    id: "video",
    label: "Vídeo e áudio",
    terms: [
      "video", "videos", "corte", "cortes", "musica", "musicas", "audio", "audios",
      "edicao", "narracao", "trilha", "trilhas", "locucao", "animacao",
    ],
  },
  {
    id: "strategy",
    label: "Conteúdo e estratégia",
    terms: [
      "abordagem", "tema", "temas", "conteudo", "conteudos", "roteiro", "roteiros",
      "ideia", "ideias", "estrategia", "estrategias", "tom", "posicionamento",
      "publico alvo", "objetivo",
    ],
  },
  {
    id: "offer",
    label: "CTA e oferta",
    terms: [
      "cta", "oferta", "ofertas", "preco", "precos", "valor", "valores", "desconto",
      "descontos", "link", "links", "botao", "botoes", "conversao", "comprar",
    ],
  },
  {
    id: "schedule",
    label: "Data e programação",
    terms: [
      "data", "datas", "prazo", "prazos", "horario", "horarios", "agenda",
      "agendamento", "programacao", "programar", "dia", "dias", "mes", "meses",
      "semana", "semanas", "calendario", "cronograma", "periodo", "periodos",
      "publicacao", "publicacoes", "postagem", "postagens",
    ],
  },
] as const satisfies readonly AdjustmentCategoryDefinition[];

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function searchableText(value: string) {
  return normalizedText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsCompleteTerm(text: string, term: string) {
  if (!text) return false;
  const normalizedTerm = searchableText(term);
  return ` ${text} `.includes(` ${normalizedTerm} `);
}

function categoryScore(definition: AdjustmentCategoryDefinition, title: string, comment: string) {
  return definition.terms.reduce((score, term) => {
    const specificity = Math.max(0, searchableText(term).split(" ").length - 1);
    const commentScore = containsCompleteTerm(comment, term) ? 4 + specificity : 0;
    const titleScore = containsCompleteTerm(title, term) ? 1 + specificity : 0;
    return score + commentScore + titleScore;
  }, 0);
}

export function classifyAdjustmentCategory(itemTitle: string, comment: string): Pick<AdjustmentCategory, "id" | "label"> {
  const normalizedTitle = searchableText(itemTitle);
  const normalizedComment = searchableText(comment);
  const ranked = ADJUSTMENT_CATEGORIES
    .map((definition) => ({
      definition,
      score: categoryScore(definition, normalizedTitle, normalizedComment),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.definition.label.localeCompare(b.definition.label, "pt-BR"));
  const winner = ranked[0]?.definition;
  return winner
    ? { id: winner.id, label: winner.label }
    : { id: "other", label: "Outros ajustes" };
}

function projectApprovers(approvals: PlanApprovals) {
  const names = new Map<string, string>();
  const remember = (name?: string, reviewerId?: string) => {
    const clean = name?.trim();
    if (!clean || clean === "Vizantu") return;
    const key = reviewerId?.trim() || normalizedText(clean);
    if (!key.startsWith("system-")) names.set(key, clean);
  };

  approvals.history.forEach((event) => remember(event.approverName, event.reviewerId));
  approvals.items.forEach((item) => item.responses?.forEach((response) => remember(response.approverName, response.reviewerId)));
  return [...names.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export function buildDashboardProjects(plans: Plan[], approvalsBySlug: Record<string, PlanApprovals>) {
  return plans.map((plan): DashboardProject => {
    if (plan.kind === "presentation") {
      return {
        slug: plan.slug,
        title: plan.title,
        client: planClientName(plan),
        kind: plan.kind,
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
        reviewVersion: plan.reviewVersion || 1,
        total: 0,
        approved: 0,
        changesRequested: 0,
        pending: 0,
        approvalRate: 0,
        approvers: [],
        viewers: [],
        status: "presentation",
        adjustments: [],
      };
    }

    const approvals = approvalsBySlug[plan.slug] || { planSlug: plan.slug, items: [], history: [] };
    const total = approvals.items.length;
    const approved = approvals.autoApproved ? total : approvals.items.filter((item) => item.status === "approved").length;
    const changesRequested = approvals.autoApproved ? 0 : approvals.items.filter((item) => item.status === "changes_requested").length;
    const pending = Math.max(0, total - approved - changesRequested);
    const status = approvals.autoApproved || (total > 0 && approved === total)
      ? "approved"
      : changesRequested > 0 && pending === 0
        ? "adjustments"
        : approved > 0 || changesRequested > 0
          ? "review"
          : "pending";
    const adjustments = approvals.history
      .filter((event) => event.action === "changes_requested" && event.comment.trim())
      .map((event) => ({
        id: event.id,
        comment: event.comment.trim(),
        itemTitle: event.itemTitle,
        createdAt: event.createdAt,
      }));

    return {
      slug: plan.slug,
      title: plan.title,
      client: planClientName(plan),
      kind: plan.kind,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
      reviewVersion: plan.reviewVersion || 1,
      total,
      approved,
      changesRequested,
      pending,
      approvalRate: total ? Math.round((approved / total) * 100) : 0,
      approvers: projectApprovers(approvals),
      viewers: [...(approvals.viewers || [])].sort((a, b) => b.lastViewedAt.localeCompare(a.lastViewedAt)),
      status,
      adjustments,
    };
  });
}

export function groupAdjustmentCategories(projects: DashboardProject[]) {
  const grouped = new Map<string, AdjustmentCategory>();

  projects.flatMap((project) => project.adjustments).forEach((adjustment) => {
    const definition = classifyAdjustmentCategory(adjustment.itemTitle, adjustment.comment);
    const current = grouped.get(definition.id) || { id: definition.id, label: definition.label, count: 0, examples: [] };
    current.count += 1;
    if (!current.examples.includes(adjustment.comment) && current.examples.length < 3) current.examples.push(adjustment.comment);
    grouped.set(definition.id, current);
  });

  return [...grouped.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "pt-BR"));
}
