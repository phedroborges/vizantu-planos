import { expect, test } from "@playwright/test";
import { fixtures } from "./helpers";

// O pipeline de blob legado (dashboard.tsx, storage.ts local) nunca foi
// tocado nesta implementação — ele nem sabe que a tabela `plans` do
// Supabase existe. Estes testes provam que ele continua respondendo
// normalmente mesmo com dados nativos [E2E] presentes no mesmo banco, e que
// os dois modelos de sessão (admin sem login vs. cookie do cliente) não se
// atravessam.
test.describe("Convivência com o pipeline legado (blob)", () => {
  test("1. painel admin /planos carrega normalmente", async ({ page }) => {
    const response = await page.goto("/planos");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Publicar novo plano")).toBeVisible();
  });

  test("2. calendário admin carrega normalmente", async ({ page }) => {
    const response = await page.goto("/calendario");
    expect(response?.status()).toBe(200);
  });

  test("3. dashboard admin (home) carrega normalmente", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
  });

  test("4. sessão do cliente (cookie httpOnly) não dá acesso nem interfere no painel admin", async ({ page }) => {
    const { validToken } = fixtures();
    await page.goto(`/c/${validToken}`);
    await expect(page).toHaveURL(/\/c\/dashboard$/);
    // Mesmo navegador, mesma sessão de cookies — o admin (sem login, por
    // design) continua acessível e não pede nada relacionado ao cliente.
    const response = await page.goto("/planos");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("Publicar novo plano")).toBeVisible();
  });

  test("5. planos nativos [E2E] não aparecem na listagem do painel legado (fontes diferentes)", async ({ page }) => {
    await page.goto("/planos");
    await expect(page.getByText("[E2E] Plano dashboard")).toHaveCount(0);
  });
});
