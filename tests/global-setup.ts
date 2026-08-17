import { writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

export const FIXTURE_PATH = path.resolve(__dirname, ".fixtures.json");

// Cria dados isolados (projeto/cliente/plano/itens/tokens com prefixo [E2E])
// direto no banco compartilhado com o vizantu-tarefas, só pra rodar a suíte
// contra dados reais sem depender de rodar o outro app — global-teardown
// apaga tudo de novo no fim (delete em `projects` já cascateia o resto).
export default async function globalSetup() {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes (.env.local) — necessários pra rodar os testes.");
  }
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: project } = await db.from("projects").insert({ name: "[E2E] Planos Playwright", status: "ativo" }).select().single();
  const projectId = project!.id;

  const { data: plan } = await db.from("plans").insert({ project_id: projectId, title: "[E2E] Plano dashboard", kind: "content", source: "native" }).select().single();
  const { data: captacao } = await db.from("plan_captacoes").insert({ plan_id: plan!.id, label: "1ª Captação", sequence_order: 0 }).select().single();

  const { data: formatTag } = await db.from("tags").insert({ kind: "formato", label: "[E2E] Vídeo" }).select().single();

  const today = new Date();
  const dueDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const { data: pendingTask } = await db
    .from("tasks")
    .insert({
      project_id: projectId,
      plan_id: plan!.id,
      captacao_id: captacao!.id,
      name: "[E2E] Item pendente",
      format_tag_ids: [formatTag!.id],
      due_date: dueDate,
      script_text: "Roteiro do item pendente",
    })
    .select()
    .single();

  const { data: approvedTask } = await db
    .from("tasks")
    .insert({ project_id: projectId, plan_id: plan!.id, captacao_id: captacao!.id, name: "[E2E] Item já aprovado", format_tag_ids: [formatTag!.id] })
    .select()
    .single();
  await db.from("plan_item_approvals").insert({ task_id: approvedTask!.id, status: "approved" });

  const { data: client } = await db
    .from("plan_clients")
    .insert({ project_id: projectId, name: "[E2E] Cliente Teste", role_title: "Médica", city: "Mineiros - GO", instagram_handle: "clienteteste" })
    .select()
    .single();

  const now = Date.now();
  const [{ data: validToken }, { data: revokedToken }, { data: expiredToken }] = await Promise.all([
    db.from("plan_client_tokens").insert({ client_id: client!.id, token: `e2e-valid-${now}` }).select().single(),
    db.from("plan_client_tokens").insert({ client_id: client!.id, token: `e2e-revoked-${now}`, revoked_at: new Date().toISOString() }).select().single(),
    db.from("plan_client_tokens").insert({ client_id: client!.id, token: `e2e-expired-${now}`, expires_at: new Date(now - 1000 * 60).toISOString() }).select().single(),
  ]);

  writeFileSync(
    FIXTURE_PATH,
    JSON.stringify(
      {
        projectId,
        planId: plan!.id,
        clientId: client!.id,
        pendingTaskId: pendingTask!.id,
        approvedTaskId: approvedTask!.id,
        validToken: validToken!.token,
        revokedToken: revokedToken!.token,
        expiredToken: expiredToken!.token,
      },
      null,
      2,
    ),
  );
}
