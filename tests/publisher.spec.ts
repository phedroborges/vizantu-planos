import { expect, test } from "@playwright/test";
import type { FrameLocator, Page } from "@playwright/test";
import { strToU8, zipSync } from "fflate";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function planFrame(page: Page) {
  return page.frameLocator("[data-vizantu-plan-frame]");
}

async function identify(frame: FrameLocator, name: string) {
  const input = frame.getByLabel("Seu nome");
  await expect(input).toBeVisible();
  await input.fill(name);
  await frame.getByRole("button", { name: "Começar avaliação" }).click();
  await expect(frame.getByText(`Identificado: ${name}`, { exact: false })).toBeVisible();
}

test("preserva pareceres simultâneos sem perder histórico", async ({ page }, testInfo) => {
  const slug = `concorrencia-${testInfo.project.name}`;
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Plano concorrente</title></head>
      <body>
        <div class="approval" data-id="item-1" data-title="Item 1"></div>
        <div class="approval" data-id="item-2" data-title="Item 2"></div>
      </body>
    </html>`;

  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Plano concorrente",
      slug,
      file: { name: "concorrencia.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);

  try {
    await page.goto(`/${slug}`);
    await expect(planFrame(page).locator(".vz-status-line").first()).toContainText("Aprove este conteúdo");

    const [first, second] = await Promise.all([
      page.request.post(`/api/plans/${slug}/approvals`, {
        data: { action: "record", itemId: "item-1", itemTitle: "Item 1", status: "approved", comment: "" },
      }),
      page.request.post(`/api/plans/${slug}/approvals`, {
        data: { action: "record", itemId: "item-2", itemTitle: "Item 2", status: "changes_requested", comment: "Ajustar item 2." },
      }),
    ]);
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();

    const result = await page.request.get(`/api/plans/${slug}/approvals`);
    const { approvals } = await result.json();
    expect(approvals.items.find((item: { id: string }) => item.id === "item-1").status).toBe("approved");
    expect(approvals.items.find((item: { id: string }) => item.id === "item-2")).toMatchObject({
      status: "changes_requested",
      comment: "Ajustar item 2.",
    });
    expect(approvals.history).toHaveLength(2);
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
});

test("sincroniza duas telas e preserva comentário ainda não enviado", async ({ page, context }, testInfo) => {
  const slug = `tempo-real-${testInfo.project.name}`;
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Plano sincronizado</title></head>
      <body>
        <div class="approval" data-id="item-1" data-title="Item 1"></div>
        <div class="approval" data-id="item-2" data-title="Item 2"></div>
      </body>
    </html>`;

  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Plano sincronizado",
      slug,
      file: { name: "tempo-real.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);

    const secondPage = await context.newPage();
  try {
    await Promise.all([page.goto(`/${slug}`), secondPage.goto(`/${slug}`)]);
    await identify(planFrame(page), "Cliente sincronizado");
    await identify(planFrame(secondPage), "Cliente sincronizado");
    const firstBox = planFrame(page).locator('[data-id="item-1"]');
    const mirroredBox = planFrame(secondPage).locator('[data-id="item-1"]');
    const draftBox = planFrame(secondPage).locator('[data-id="item-2"]');
    await expect(firstBox.locator(".vz-approve")).toBeVisible();
    await expect(draftBox.locator(".vz-request")).toBeVisible();

    await draftBox.locator(".vz-request").click();
    await draftBox.locator("textarea").fill("Comentário ainda em edição.");
    await firstBox.locator(".vz-approve").click();

    await expect(mirroredBox.locator(".vz-badge-approved")).toBeVisible({ timeout: 6_000 });
    await expect(draftBox.locator("textarea")).toHaveValue("Comentário ainda em edição.");
  } finally {
    await secondPage.close();
    await page.request.delete(`/api/plans/${slug}`);
  }
});

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
  await expect(publicPage.locator("[data-vizantu-plan-frame]")).toHaveAttribute("sandbox", /allow-scripts/);
  const documentResponse = await publicPage.request.get(`/api/plans/${slug}/document`);
  expect(documentResponse.headers()["content-security-policy"]).toContain("sandbox");
  const publicFrame = planFrame(publicPage);
  await expect(publicFrame.getByRole("heading", { name: "Publicação funcionando" })).toBeVisible();
  await identify(publicFrame, "Cliente Teste");
  await publicFrame.getByRole("button", { name: "Testar" }).click();
  await expect(publicFrame.locator("body")).toHaveAttribute("data-clicked", "sim");
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
    const frame = planFrame(page);
    await identify(frame, "Cliente do projeto ZIP");
    await expect(frame.getByRole("heading", { name: "Plano vindo do ZIP" })).toBeVisible();
    await expect(frame.getByAltText("Marca ZIP")).toHaveAttribute("src", /^data:image\/svg\+xml;base64,/);
    await frame.getByRole("button", { name: "Interações 0" }).click();
    await expect(frame.getByRole("button", { name: "Interações 1" })).toBeVisible();
    await expect(frame.locator(".vz-generated-approval")).toHaveCount(1);
    await expect(frame.locator('[data-id="secao-vizantu-slide-01"]')).toContainText("APROVAÇÃO DA SEÇÃO");
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
    const frame = planFrame(page);
    await identify(frame, "Cliente das seções");
    await expect(frame.locator(".vz-generated-approval")).toHaveCount(1);
    await expect(frame.locator('[data-id="conteudo-video-1"]')).toContainText("APROVAÇÃO DO CONTEÚDO");

    const content = frame.locator('[data-id="conteudo-video-1"]');
    await content.locator(".vz-request").click();
    await content.locator(".vz-edit textarea").fill("Rever a meta principal.");
    await content.locator(".vz-send").click();
    await expect(content.locator(".vz-badge-changes")).toContainText("Ajuste solicitado");

    await page.goto(`/revisoes/${slug}`);
    await expect(page.locator(".approval-item")).toHaveCount(1);
    await expect(page.getByText("Rever a meta principal.", { exact: true }).first()).toBeVisible();
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
});

test("apresentação não recebe fluxo de aprovação", async ({ page }, testInfo) => {
  const slug = `apresentacao-${testInfo.project.name}`;
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Apresentação</title></head>
      <body>
        <section class="band" id="proposta"><div class="shell"><span class="section-no">01 · Proposta</span><h2>Proposta comercial</h2></div></section>
      </body>
    </html>`;

  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Apresentação de proposta",
      slug,
      kind: "presentation",
      file: { name: "apresentacao.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);

  try {
    await page.goto(`/${slug}`);
    let frame = planFrame(page);
    await expect(frame.getByRole("heading", { name: "Proposta comercial" })).toBeVisible();
    await expect(frame.locator(".vz-generated-approval")).toHaveCount(0);
    await expect(frame.locator('script[data-vizantu-approval-client]')).toHaveCount(0);

    const patched = await page.request.patch(`/api/plans/${slug}`, { data: { kind: "approval" } });
    expect(patched.status()).toBe(200);
    await page.goto(`/${slug}`);
    frame = planFrame(page);
    await expect(frame.locator('script[data-vizantu-approval-client]')).toHaveCount(1);
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
    const frame = planFrame(page);
    await identify(frame, "Cliente da aprovação");
    const box = frame.locator('.approval[data-id="conteudo-1"]');
    await expect(box.locator(".vz-status-line")).toContainText("Aprove este conteúdo ou peça um ajuste.");

    const send = box.locator(".vz-send");
    await box.locator(".vz-request").click();
    await expect(send).toBeDisabled();
    await box.locator(".vz-edit textarea").fill("Trocar a abertura e manter o encerramento.");
    await expect(send).toBeEnabled();
    await send.click();
    await expect(box.locator(".vz-badge-changes")).toContainText("Ajuste solicitado");
    await expect(box.locator(".vz-badge-comment")).toContainText("Trocar a abertura e manter o encerramento.");

    await page.goto(`/revisoes/${slug}`);
    await expect(page.getByText("Plano com ajustes", { exact: true })).toBeVisible();
    await expect(page.getByText("Trocar a abertura e manter o encerramento.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Solicitou ajuste", { exact: true })).toBeVisible();

    await page.goto(`/${slug}`);
    await expect(frame.locator(".vz-gate")).toHaveCount(0);
    await expect(box.locator(".vz-badge-changes")).toContainText("Ajuste solicitado");
    await box.locator(".vz-undo").click();
    await box.locator(".vz-approve").click();
    await expect(box.locator(".vz-badge-approved")).toContainText("Conteúdo aprovado");

    await page.goto(`/revisoes/${slug}`);
    await expect(page.getByText("Plano aprovado", { exact: true })).toBeVisible();
    await expect(page.getByText("Aprovou o conteúdo", { exact: true })).toBeVisible();
    await expect(page.getByText("Solicitou ajuste", { exact: true })).toBeVisible();
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
});

test("encerra no prazo, aprova automaticamente e permite reabrir", async ({ page }, testInfo) => {
  const slug = `prazo-${testInfo.project.name}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Plano com prazo</title></head><body><main><h1>Campanha de prazo</h1><div class="approval" data-id="campanha-1" data-title="Campanha principal"></div></main></body></html>`;
  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Plano com prazo",
      slug,
      kind: "approval",
      approvalDays: "7",
      file: { name: "prazo.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);
  const uploaded = await upload.json();
  expect(uploaded.plan.approvalPeriodDays).toBe(7);
  expect(Date.parse(uploaded.plan.approvalDeadline)).toBeGreaterThan(Date.now());

  try {
    await page.goto(`/${slug}`);
    await expect(page.getByText("Prazo para aprovação", { exact: true })).toBeVisible();
    await expect(page.locator("#vz-deadline-countdown")).toContainText(/\d/);
    const frame = planFrame(page);
    await expect(frame.getByText(/Após esse horário.*aprovado automaticamente/)).toBeVisible();
    await identify(frame, "Cliente do Prazo");

    const review = await page.request.post(`/api/plans/${slug}/approvals`, {
      data: {
        action: "record",
        itemId: "campanha-1",
        itemTitle: "Campanha principal",
        status: "changes_requested",
        comment: "Ajustar a chamada.",
        approverName: "Cliente do Prazo",
        reviewerId: "cliente-prazo",
      },
    });
    expect(review.status()).toBe(200);

    const metadataPath = path.join(process.cwd(), ".data", "metadata", `${slug}.json`);
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    metadata.approvalDeadline = new Date(Date.now() - 60_000).toISOString();
    await writeFile(metadataPath, JSON.stringify(metadata), "utf8");

    const expired = await page.request.get(`/api/plans/${slug}/approvals`);
    expect(expired.status()).toBe(200);
    const expiredData = await expired.json();
    expect(expiredData.summary).toMatchObject({ status: "approved", autoApproved: true });
    expect(expiredData.approvals.items[0].status).toBe("approved");

    const lateReview = await page.request.post(`/api/plans/${slug}/approvals`, {
      data: {
        action: "record",
        itemId: "campanha-1",
        itemTitle: "Campanha principal",
        status: "approved",
        comment: "",
        approverName: "Cliente atrasado",
        reviewerId: "cliente-atrasado",
      },
    });
    expect(lateReview.status()).toBe(409);

    await page.goto(`/${slug}`);
    await expect(page.getByRole("heading", { name: "Prazo de aprovação encerrado." })).toBeVisible();
    await expect(page.locator("[data-vizantu-plan-frame]")).toHaveCount(0);
    expect((await page.request.get(`/api/plans/${slug}/document`)).status()).toBe(410);
    await page.goto(`/revisoes/${slug}`);
    await expect(page.getByText("Plano aprovado automaticamente", { exact: true })).toBeVisible();
    await expect(page.getByText(/Os pareceres anteriores continuam preservados/)).toBeVisible();

    const reopened = await page.request.patch(`/api/plans/${slug}`, { data: { approvalDays: 3 } });
    expect(reopened.status()).toBe(200);
    const reopenedPlan = await reopened.json();
    expect(reopenedPlan.plan.approvalPeriodDays).toBe(3);
    expect(Date.parse(reopenedPlan.plan.approvalDeadline)).toBeGreaterThan(Date.now());

    const activeAgain = await page.request.get(`/api/plans/${slug}/approvals`);
    const activeData = await activeAgain.json();
    expect(activeData.approvals.autoApproved).toBe(false);
    expect(activeData.approvals.items[0].status).toBe("changes_requested");
    await page.goto(`/${slug}`);
    await expect(page.locator("[data-vizantu-plan-frame]")).toBeVisible();
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
});

test("mostra ajustes e histórico ao lado do editor", async ({ page }, testInfo) => {
  const slug = `editor-historico-${testInfo.project.name}`;
  const html = `<!doctype html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Editor com histórico</title></head>
      <body>
        <main>
          <article id="video-1">
            <h2>Vídeo de lançamento</h2>
            <p>Texto original do roteiro.</p>
            <div class="approval" data-id="video-1" data-title="Vídeo de lançamento"></div>
          </article>
        </main>
      </body>
    </html>`;

  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Editor com histórico",
      slug,
      file: { name: "editor-historico.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);

  try {
    const review = await page.request.post(`/api/plans/${slug}/approvals`, {
      data: {
        action: "record",
        itemId: "video-1",
        itemTitle: "Vídeo de lançamento",
        status: "changes_requested",
        comment: "Trocar a abertura por uma pergunta mais forte.",
        approverName: "Cliente Teste",
      },
    });
    expect(review.ok()).toBeTruthy();

    await page.goto(`/editar/${slug}`);
    await expect(page.getByRole("heading", { name: "Ajustes e histórico" })).toBeVisible();
    await expect(page.getByText("1 ajuste pendente", { exact: true })).toBeVisible();
    await expect(page.getByText("Trocar a abertura por uma pergunta mais forte.", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Solicitou ajuste", { exact: true })).toBeVisible();

    await page.locator(".editor-adjustment").click();
    const frame = page.frameLocator(".editor-frame");
    await expect(frame.locator("#video-1")).toHaveAttribute("data-vz-editor-target", "true");

    await frame.getByText("Texto original do roteiro.", { exact: true }).fill("Texto atualizado a partir do parecer.");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("button", { name: "Salvo" })).toBeVisible();

    await page.goto(`/${slug}`);
    await expect(planFrame(page).getByText("Texto atualizado a partir do parecer.", { exact: true })).toBeVisible();
  } finally {
    await page.request.delete(`/api/plans/${slug}`);
  }
});

test("lembra a pessoa e preserva pareceres independentes no mesmo link", async ({ page, browser }, testInfo) => {
  const slug = `multiplos-revisores-${testInfo.project.name}`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Múltiplos revisores</title></head><body><main><article><h1>Vídeo principal</h1><div class="approval" data-id="video-principal" data-title="Vídeo principal"></div></article></main></body></html>`;
  const upload = await page.request.post("/api/plans", {
    multipart: {
      title: "Múltiplos revisores",
      slug,
      file: { name: "multiplos.html", mimeType: "text/html", buffer: Buffer.from(html) },
    },
  });
  expect(upload.status()).toBe(201);

  const fernandoContext = await browser.newContext();
  const fernandoPage = await fernandoContext.newPage();
  try {
    await page.goto(`/${slug}`);
    let francieleFrame = planFrame(page);
    await identify(francieleFrame, "Franciele");
    const francieleBox = francieleFrame.locator('[data-id="video-principal"]');
    await francieleBox.locator(".vz-request").click();
    await francieleBox.locator("textarea").fill("Trocar a primeira frase.");
    await francieleBox.locator(".vz-send").click();
    await expect(francieleBox.locator(".vz-badge-changes")).toBeVisible();

    await page.reload();
    francieleFrame = planFrame(page);
    await expect(francieleFrame.locator(".vz-gate")).toHaveCount(0);
    await expect(francieleFrame.getByText("Identificado: Franciele", { exact: false })).toBeVisible();

    await fernandoPage.goto(`/${slug}`);
    const fernandoFrame = planFrame(fernandoPage);
    await identify(fernandoFrame, "Fernando");
    const fernandoBox = fernandoFrame.locator('[data-id="video-principal"]');
    await fernandoBox.locator(".vz-approve").click();
    await expect(fernandoBox.locator(".vz-badge-approved")).toContainText("Conteúdo aprovado");
    await expect(fernandoBox.locator(".vz-badge-approved")).toContainText("Fernando");

    let result = await page.request.get(`/api/plans/${slug}/approvals`);
    let { approvals } = await result.json();
    expect(approvals.items[0].status).toBe("approved");
    expect(approvals.items[0].responses).toEqual(expect.arrayContaining([
      expect.objectContaining({ approverName: "Franciele", status: "changes_requested", comment: "Trocar a primeira frase." }),
      expect.objectContaining({ approverName: "Fernando", status: "approved" }),
    ]));

    await page.goto(`/revisoes/${slug}`);
    await expect(page.getByText("Franciele", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Fernando", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Trocar a primeira frase.", { exact: true }).first()).toBeVisible();

    await fernandoBox.locator(".vz-undo").click();
    await expect(fernandoBox.locator(".vz-badge-changes")).toBeVisible();
    result = await page.request.get(`/api/plans/${slug}/approvals`);
    ({ approvals } = await result.json());
    expect(approvals.items[0].status).toBe("changes_requested");
  } finally {
    await fernandoContext.close();
    await page.request.delete(`/api/plans/${slug}`);
  }
});
