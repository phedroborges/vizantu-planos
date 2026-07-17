import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

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

test("compila e publica um projeto React em ZIP", async ({ page }, testInfo) => {
  const slug = `projeto-zip-${testInfo.project.name}`;
  const archive = zipSync({
    "app/page.tsx": strToU8(`"use client";
      import { useState } from "react";
      export default function Page() {
        const [count, setCount] = useState(0);
        return <main><section className="slide"><div className="deck"><img alt="Marca ZIP" src="/assets/mark.svg" /><h2>Plano vindo do ZIP</h2><button onClick={() => setCount(count + 1)}>Interações {count}</button></div></section></main>;
      }`),
    "app/globals.css": strToU8("body{margin:0;font-family:Arial}.slide{padding:40px}.deck{max-width:800px;margin:auto}.deck img{width:40px}"),
    "app/layout.tsx": strToU8('export const metadata = { title: "Plano ZIP" };'),
    "public/assets/mark.svg": strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#84b523" d="M0 0h10v10H0z"/></svg>'),
  });

  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Projeto ZIP",
      slug,
      file: { name: "projeto.zip", mimeType: "application/zip", buffer: Buffer.from(archive) },
    },
  });
  expect(upload.status()).toBe(201);

  try {
    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { name: "Plano vindo do ZIP" })).toBeVisible();
    await expect(page.getByAltText("Marca ZIP")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
    await page.getByRole("button", { name: "Interações 0" }).click();
    await expect(page.getByRole("button", { name: "Interações 1" })).toBeVisible();
    await expect(page.locator(".vz-generated-approval")).toHaveCount(1);
    await expect(page.locator('[data-id="secao-vizantu-slide-01"]')).toContainText("APROVAÇÃO DA SEÇÃO");
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
});

test("cria aprovações automaticamente por seção e conteúdo", async ({ page }, testInfo) => {
  const slug = `secoes-${testInfo.project.name}`;
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Plano por seções</title></head>
      <body>
        <section class="band" id="objetivo"><div class="shell"><span class="section-no">01 · Objetivo</span><h2>Objetivo da campanha</h2></div></section>
        <section class="band" id="conteudos"><div class="shell"><span class="section-no">02 · Conteúdos</span><h2>Conteúdos da campanha</h2>
          <article class="script" id="video-1"><header class="script-header"><span class="eyebrow">Material 01</span><h3>Vídeo de abertura</h3></header></article>
        </div></section>
      </body>
    </html>`;

  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Plano por seções",
      slug,
      file: { name: "secoes.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);

  try {
    await page.goto(`/${slug}`);
    await expect(page.locator(".vz-generated-approval")).toHaveCount(3);
    await expect(page.locator('[data-id="secao-objetivo"]')).toContainText("APROVAÇÃO DA SEÇÃO");
    await expect(page.locator('[data-id="conteudo-video-1"]')).toContainText("APROVAÇÃO DO CONTEÚDO");

    const objective = page.locator('[data-id="secao-objetivo"]');
    await objective.locator("textarea").fill("Rever a meta principal.");
    await objective.locator(".btn-adjust").click();
    await expect(objective.locator(".btn-adjust")).toHaveClass(/active/);

    await page.goto(`/revisoes/${slug}`);
    await expect(page.locator(".approval-item")).toHaveCount(3);
    await expect(page.getByText("Rever a meta principal.", { exact: true }).first()).toBeVisible();
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
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
