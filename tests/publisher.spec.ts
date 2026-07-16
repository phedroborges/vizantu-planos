import { expect, test } from "@playwright/test";

test("publica, abre e exclui um HTML", async ({ page, context }, testInfo) => {
  const slug = `teste-${testInfo.project.name}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Planos publicados" })).toBeVisible();
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);

  await page.getByLabel("Título").fill(`Plano de teste ${testInfo.project.name}`);
  await page.getByLabel("Endereço").fill(slug);
  await page.locator('input[type="file"]').setInputFiles({
    name: "teste.html",
    mimeType: "text/html",
    buffer: Buffer.from(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano de teste</title></head><body><h1>Publicação funcionando</h1><button onclick="document.body.dataset.clicked='sim'">Testar</button></body></html>`),
  });
  await page.getByRole("button", { name: "Publicar plano" }).click();
  await expect(page.getByText(`Plano de teste ${testInfo.project.name}`, { exact: true })).toBeVisible();

  const publicPage = await context.newPage();
  const response = await publicPage.goto(`/${slug}`);
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  expect(response?.headers()["content-security-policy"]).toContain("sandbox");
  await expect(publicPage.getByRole("heading", { name: "Publicação funcionando" })).toBeVisible();
  await publicPage.getByRole("button", { name: "Testar" }).click();
  await expect(publicPage.locator("body")).toHaveAttribute("data-clicked", "sim");
  await publicPage.close();

  page.on("dialog", (dialog) => dialog.accept());
  const row = page.locator(".plan-row", { hasText: `Plano de teste ${testInfo.project.name}` });
  await row.getByRole("button", { name: /Excluir/ }).click();
  await expect(row).toHaveCount(0);

  const viewport = page.viewportSize();
  const dimensions = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  expect(viewport?.width).toBe(testInfo.project.name === "mobile" ? 390 : 1440);
});

test("salva parecer por conteúdo e preserva o histórico", async ({ page }, testInfo) => {
  const slug = `aprovacao-${testInfo.project.name}`;
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Plano com aprovação</title></head>
      <body>
        <article id="conteudo-1">
          <h1>Conteúdo de teste</h1>
          <div class="approval" data-id="conteudo-1" data-title="Vídeo 1 · Conteúdo de teste">
            <button type="button" class="btn-ok">Aprovar</button>
            <button type="button" class="btn-adjust">Pedir ajuste</button>
            <textarea aria-label="Comentário"></textarea>
          </div>
        </article>
      </body>
    </html>`;

  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Plano com aprovação",
      slug,
      file: { name: "aprovacao.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);

  try {
    await page.goto(`/${slug}`);
    await expect(page.locator(".vz-save-state")).toContainText("Ainda não avaliado");
    await page.getByLabel("Comentário").fill("Trocar a abertura e manter o encerramento.");
    await page.getByRole("button", { name: "Pedir ajuste" }).click();
    await expect(page.getByRole("button", { name: "Pedir ajuste" })).toHaveClass(/active/);
    await expect(page.locator(".vz-save-state")).toContainText("Salvo em");

    await page.goto(`/revisoes/${slug}`);
    await expect(page.getByText("Plano com ajustes", { exact: true })).toBeVisible();
    await expect(page.getByText("Trocar a abertura e manter o encerramento.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Solicitou ajuste", { exact: true })).toBeVisible();

    await page.goto(`/${slug}`);
    await expect(page.getByRole("button", { name: "Pedir ajuste" })).toHaveClass(/active/);
    await page.getByRole("button", { name: "Aprovar" }).click();
    await expect(page.getByRole("button", { name: "Aprovar" })).toHaveClass(/active/);

    await page.goto(`/revisoes/${slug}`);
    await expect(page.getByText("Plano aprovado", { exact: true })).toBeVisible();
    await expect(page.getByText("Aprovou o conteúdo", { exact: true })).toBeVisible();
    await expect(page.getByText("Solicitou ajuste", { exact: true })).toBeVisible();
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
});
