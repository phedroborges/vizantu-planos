import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { fixtures } from "./helpers";

// Aprovado/reprovado são estados terminais no widget (uma vez decidido, o
// modal não oferece mais ações) — por isso cada cenário cria seu PRÓPRIO
// item pendente em vez de reaproveitar o mesmo em sequência, senão um teste
// deixaria o item num estado que quebraria o próximo.
const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function createPendingItem(name: string) {
  const { planId, projectId } = fixtures();
  const { data: captacao } = await db.from("plan_captacoes").select("id").eq("plan_id", planId).limit(1).single();
  const { data: task } = await db.from("tasks").insert({ project_id: projectId, plan_id: planId, captacao_id: captacao!.id, name }).select().single();
  return task!.id as string;
}

test.describe("Fluxo de aprovação", () => {
  test.beforeEach(async ({ page }) => {
    const { validToken } = fixtures();
    await page.goto(`/c/${validToken}`);
    await expect(page).toHaveURL(/\/c\/dashboard$/);
  });

  test("1. aprovar exige nome preenchido (botão fica desabilitado até então)", async ({ page }) => {
    const name = `[E2E] Item teste 1 — ${Date.now()}`;
    await createPendingItem(name);
    await page.reload();
    await page.getByText(name).click();
    const approveBtn = page.getByRole("button", { name: "Aprovar" });
    await expect(approveBtn).toBeDisabled();
    await page.getByPlaceholder("Como podemos te identificar?").fill("Cliente E2E");
    await expect(approveBtn).toBeEnabled();
  });

  test("2. aprovar muda o status pra 'aprovado' e fecha o modal", async ({ page }) => {
    const name = `[E2E] Item teste 2 — ${Date.now()}`;
    await createPendingItem(name);
    await page.reload();
    await page.getByText(name).click();
    await page.getByPlaceholder("Como podemos te identificar?").fill("Cliente E2E");
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.getByText("Aprovado — obrigado!")).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.locator(".cd-approval-modal")).toBeHidden();
    await expect(page.locator(".cd-group-item", { hasText: name }).locator(".cd-pill.status-approved")).toBeVisible();
  });

  test("3. pedir ajuste exige comentário antes de habilitar o envio", async ({ page }) => {
    const name = `[E2E] Item teste 3 — ${Date.now()}`;
    await createPendingItem(name);
    await page.reload();
    await page.getByText(name).click();
    await page.getByPlaceholder("Como podemos te identificar?").fill("Cliente E2E");
    await page.getByRole("button", { name: "Pedir ajuste" }).click();
    const sendBtn = page.getByRole("button", { name: "Enviar pedido de ajuste" });
    await expect(sendBtn).toBeDisabled();
    await page.getByPlaceholder("O que precisa ajustar?").fill("Trocar a trilha sonora");
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator(".cd-group-item", { hasText: name }).locator(".cd-pill.status-changes_requested")).toBeVisible();
  });

  test("4. reprovar exige motivo antes de confirmar", async ({ page }) => {
    const name = `[E2E] Item teste 4 — ${Date.now()}`;
    await createPendingItem(name);
    await page.reload();
    await page.getByText(name).click();
    await page.getByPlaceholder("Como podemos te identificar?").fill("Cliente E2E");
    await page.getByRole("button", { name: "Reprovar" }).click();
    const confirmBtn = page.getByRole("button", { name: "Confirmar reprovação" });
    await expect(confirmBtn).toBeDisabled();
    await page.getByPlaceholder("Conta pra gente o motivo da reprovação").fill("Não bateu com o briefing");
    await confirmBtn.click();
    await page.waitForTimeout(300);
    await expect(page.locator(".cd-group-item", { hasText: name }).locator(".cd-pill.status-rejected")).toBeVisible();
  });

  test("5. pesquisa de satisfação salva a nota escolhida", async ({ page }) => {
    await page.getByRole("button", { name: /refazer a pesquisa/ }).click();
    await page.getByRole("button", { name: "9", exact: true }).click();
    await expect(page.locator(".cd-score")).toHaveText("9/10");
  });
});
