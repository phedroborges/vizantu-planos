import { getDb, unwrap } from "./db";

// Tipos "nativos" (schema compartilhado com o vizantu-tarefas) — prefixados
// pra não colidir com Plan/ApprovalStatus/PlanKind já usados pelo pipeline
// de blob legado em src/lib/types.ts, que continua intocado.

export type NativeClient = {
  id: string;
  projectId: string;
  name: string;
  roleTitle: string | null;
  city: string | null;
  instagramHandle: string | null;
};

export type NativePlanItem = {
  id: string;
  planId: string;
  name: string;
  status: string;
  dueDate: string | null;
  captacaoId: string | null;
  captacaoLabel: string | null;
  formatLabel: string | null;
  categoryLabel: string | null;
  description: string | null;
  approvalStatus: "pending" | "approved" | "changes_requested" | "rejected";
  reviewVersion: number;
  updatedAt: string;
};

export type NativeCalendarEvent = {
  id: string;
  title: string;
  date: string;
  kind: "content" | "event";
  approvalStatus?: string;
  formatLabel?: string | null;
};

// ---------- Token / cliente ----------

export async function resolveClientToken(token: string): Promise<NativeClient | null> {
  const db = getDb();
  const row = unwrap(
    await db.from("plan_client_tokens").select("id, client_id, revoked_at, expires_at").eq("token", token).maybeSingle(),
  ) as { id: string; client_id: string; revoked_at: string | null; expires_at: string | null } | null;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;

  await db.from("plan_client_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);

  const client = unwrap(
    await db.from("plan_clients").select("id, project_id, name, role_title, city, instagram_handle").eq("id", row.client_id).maybeSingle(),
  ) as { id: string; project_id: string; name: string; role_title: string | null; city: string | null; instagram_handle: string | null } | null;
  if (!client) return null;
  return { id: client.id, projectId: client.project_id, name: client.name, roleTitle: client.role_title, city: client.city, instagramHandle: client.instagram_handle };
}

export async function getClientById(id: string): Promise<NativeClient | null> {
  const db = getDb();
  const client = unwrap(
    await db.from("plan_clients").select("id, project_id, name, role_title, city, instagram_handle").eq("id", id).maybeSingle(),
  ) as { id: string; project_id: string; name: string; role_title: string | null; city: string | null; instagram_handle: string | null } | null;
  if (!client) return null;
  return { id: client.id, projectId: client.project_id, name: client.name, roleTitle: client.role_title, city: client.city, instagramHandle: client.instagram_handle };
}

// ---------- Dashboard ----------

export async function getSatisfactionScore(projectId: string): Promise<number | null> {
  const db = getDb();
  const row = unwrap(
    await db.from("client_satisfaction_scores").select("score").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ) as { score: number } | null;
  return row?.score ?? null;
}

export async function addSatisfactionScore(projectId: string, clientId: string, score: number): Promise<void> {
  const db = getDb();
  unwrap(await db.from("client_satisfaction_scores").insert({ project_id: projectId, client_id: clientId, score }));
}

// Todos os itens (tasks) dos planos kind=content/process do projeto, já
// enriquecidos com formato/categoria/captação e o status de aprovação do
// CLIENTE (plan_item_approvals) — nunca o status interno de produção.
export async function listProjectPlanItems(projectId: string): Promise<NativePlanItem[]> {
  const db = getDb();

  const plans = unwrap(await db.from("plans").select("id, kind").eq("project_id", projectId).eq("source", "native")) as { id: string; kind: string }[];
  const contentPlanIds = plans.filter((p) => p.kind === "content" || p.kind === "process").map((p) => p.id);
  if (!contentPlanIds.length) return [];

  const tasks = unwrap(
    await db
      .from("tasks")
      .select("id, plan_id, captacao_id, name, status, due_date, format_tag_ids, category_tag_ids, description, updated_at")
      .in("plan_id", contentPlanIds),
  ) as {
    id: string;
    plan_id: string;
    captacao_id: string | null;
    name: string;
    status: string;
    due_date: string | null;
    format_tag_ids: string[];
    category_tag_ids: string[];
    description: string | null;
    updated_at: string;
  }[];
  if (!tasks.length) return [];

  const taskIds = tasks.map((t) => t.id);
  const captacaoIds = Array.from(new Set(tasks.map((t) => t.captacao_id).filter((v): v is string => Boolean(v))));
  const tagIds = Array.from(new Set(tasks.flatMap((t) => [...t.format_tag_ids, ...t.category_tag_ids])));

  const [captacoes, tags, approvals] = await Promise.all([
    captacaoIds.length ? (unwrap(await db.from("plan_captacoes").select("id, label").in("id", captacaoIds)) as { id: string; label: string }[]) : Promise.resolve([]),
    tagIds.length ? (unwrap(await db.from("tags").select("id, label, kind").in("id", tagIds)) as { id: string; label: string; kind: string }[]) : Promise.resolve([]),
    unwrap(await db.from("plan_item_approvals").select("task_id, status, review_version, updated_at").in("task_id", taskIds)) as {
      task_id: string;
      status: NativePlanItem["approvalStatus"];
      review_version: number;
      updated_at: string;
    }[],
  ]);

  const captacaoById = new Map(captacoes.map((c) => [c.id, c.label]));
  const tagById = new Map(tags.map((t) => [t.id, t]));
  const approvalByTask = new Map(approvals.map((a) => [a.task_id, a]));

  return tasks.map((t) => {
    const formatId = t.format_tag_ids.find((id) => tagById.get(id)?.kind === "formato");
    const categoryId = t.category_tag_ids[0];
    const approval = approvalByTask.get(t.id);
    return {
      id: t.id,
      planId: t.plan_id,
      name: t.name,
      status: t.status,
      dueDate: t.due_date,
      captacaoId: t.captacao_id,
      captacaoLabel: t.captacao_id ? captacaoById.get(t.captacao_id) || null : null,
      formatLabel: formatId ? tagById.get(formatId)?.label || null : null,
      categoryLabel: categoryId ? tagById.get(categoryId)?.label || null : null,
      description: t.description,
      approvalStatus: approval?.status || "pending",
      reviewVersion: approval?.review_version || 1,
      updatedAt: t.updated_at,
    };
  });
}

export async function listProjectEvents(projectId: string): Promise<{ id: string; title: string; date: string }[]> {
  const db = getDb();
  const rows = unwrap(await db.from("plan_events").select("id, title, event_date").eq("project_id", projectId)) as {
    id: string;
    title: string;
    event_date: string;
  }[];
  return rows.map((r) => ({ id: r.id, title: r.title, date: r.event_date }));
}

// ---------- Aprovação (mesma regra que o storage.ts do vizantu-tarefas:
// multi-revisor, pior status vence) ----------

function aggregateResponses(responses: { status: string }[]): "pending" | "approved" | "changes_requested" | "rejected" {
  if (responses.some((r) => r.status === "rejected")) return "rejected";
  if (responses.some((r) => r.status === "changes_requested")) return "changes_requested";
  if (responses.some((r) => r.status === "approved")) return "approved";
  return "pending";
}

export async function submitApproval(input: {
  taskId: string;
  clientId: string;
  reviewerName: string;
  status: "approved" | "changes_requested" | "rejected";
  comment?: string;
}): Promise<{ status: string; reviewVersion: number }> {
  const db = getDb();
  const existing = unwrap(
    await db.from("plan_item_approvals").select("status, review_version").eq("task_id", input.taskId).maybeSingle(),
  ) as { status: string; review_version: number } | null;
  const reviewVersion = existing?.review_version ?? 1;
  const previousStatus = existing?.status ?? "pending";

  const priorResponses = unwrap(
    await db.from("plan_approval_responses").select("*").eq("task_id", input.taskId).eq("review_version", reviewVersion),
  ) as { id: string; reviewer_name: string }[];
  const ownPrior = priorResponses.find((r) => r.reviewer_name === input.reviewerName);
  if (ownPrior) {
    unwrap(await db.from("plan_approval_responses").update({ status: input.status, comment: input.comment?.trim() || null }).eq("id", ownPrior.id));
  } else {
    unwrap(
      await db.from("plan_approval_responses").insert({
        task_id: input.taskId,
        client_id: input.clientId,
        reviewer_name: input.reviewerName,
        status: input.status,
        comment: input.comment?.trim() || null,
        review_version: reviewVersion,
      }),
    );
  }

  const allResponses = unwrap(
    await db.from("plan_approval_responses").select("status").eq("task_id", input.taskId).eq("review_version", reviewVersion),
  ) as { status: string }[];
  const aggregated = aggregateResponses(allResponses);

  unwrap(await db.from("plan_item_approvals").upsert({ task_id: input.taskId, status: aggregated, review_version: reviewVersion, updated_at: new Date().toISOString() }));
  unwrap(
    await db.from("plan_approval_events").insert({
      task_id: input.taskId,
      action: input.status,
      status: aggregated,
      previous_status: previousStatus,
      comment: input.comment?.trim() || null,
      client_id: input.clientId,
      reviewer_name: input.reviewerName,
      review_version: reviewVersion,
    }),
  );

  return { status: aggregated, reviewVersion };
}
