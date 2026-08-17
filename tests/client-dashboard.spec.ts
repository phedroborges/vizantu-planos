import { expect, test } from "@playwright/test";
import { fixtures } from "./helpers";

// Assertions escopadas nos itens específicos da fixture (por nome) — não em
// contagens/percentuais globais do projeto, porque approval-flow.spec.ts
// roda no mesmo projeto de teste e cria/aprova itens próprios em paralelo
// lógico (mesma suíte, banco compartilhado).
test.describe("Dashboard do cliente", () => {
  test.beforeEach(async ({ page }) => {
    const { validToken } = fixtures();
    await page.goto(`/c/${validToken}`);
    await expect(page).toHaveURL(/\/c\/dashboard$/);
  });

  test("1. cabeçalho mostra nome, cargo e cidade do cliente semeado", async ({ page }) => {
    await expect(page.getByText("[E2E] Cliente Teste")).toBeVisible();
    await expect(page.getByText("Médica · Mineiros - GO")).toBeVisible();
  });

  test("2. 'conteúdos publicados' é um número (agrega itens aprovados do projeto)", async ({ page }) => {
    const card = page.locator(".cd-card", { hasText: "Conteúdos publicados" });
    const text = await card.locator(".cd-big-number").innerText();
    expect(Number(text)).toBeGreaterThanOrEqual(1); // pelo menos o item semeado já aprovado
  });

  test("3. calendário mostra o item pendente semeado no dia de hoje", async ({ page }) => {
    await expect(page.locator(".cd-calendar").getByTitle("[E2E] Item pendente")).toBeVisible();
  });

  test("4. barra de aprovação existe e mostra um percentual formatado", async ({ page }) => {
    await expect(page.getByText(/\d+ de \d+ conteúdos aprovados \(\d+%\)/)).toBeVisible();
  });

  test("5. seção agrupada mostra os dois itens semeados com os status certos", async ({ page }) => {
    const group = page.locator(".cd-group", { hasText: "[E2E] Vídeo" });
    await expect(group.locator(".cd-group-item", { hasText: "[E2E] Item pendente" }).locator(".cd-pill.status-pending")).toBeVisible();
    await expect(group.locator(".cd-group-item", { hasText: "[E2E] Item já aprovado" }).locator(".cd-pill.status-approved")).toBeVisible();
  });
});
