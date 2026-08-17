import { expect, test } from "@playwright/test";
import { fixtures } from "./helpers";

test.describe("Link mágico do cliente", () => {
  test("1. token válido leva ao dashboard", async ({ page }) => {
    const { validToken } = fixtures();
    await page.goto(`/c/${validToken}`);
    await expect(page).toHaveURL(/\/c\/dashboard$/);
    await expect(page.getByText("[E2E] Cliente Teste")).toBeVisible();
  });

  test("2. token revogado é rejeitado", async ({ page }) => {
    const { revokedToken } = fixtures();
    await page.goto(`/c/${revokedToken}`);
    await expect(page).toHaveURL(/\/c\/invalido$/);
  });

  test("3. token expirado é rejeitado", async ({ page }) => {
    const { expiredToken } = fixtures();
    await page.goto(`/c/${expiredToken}`);
    await expect(page).toHaveURL(/\/c\/invalido$/);
  });

  test("4. token inexistente é rejeitado", async ({ page }) => {
    await page.goto("/c/token-que-nao-existe-em-lugar-nenhum");
    await expect(page).toHaveURL(/\/c\/invalido$/);
  });

  test("5. sessão persiste — navegar de novo pro dashboard sem repassar o token funciona", async ({ page }) => {
    const { validToken } = fixtures();
    await page.goto(`/c/${validToken}`);
    await expect(page).toHaveURL(/\/c\/dashboard$/);
    await page.goto("/c/dashboard");
    await expect(page.getByText("[E2E] Cliente Teste")).toBeVisible();
  });
});
