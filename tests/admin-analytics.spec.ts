import { expect, test } from "@playwright/test";
import { classifyAdjustmentCategory } from "../src/lib/admin-analytics";

test("classifica datas e calendário como programação sem confundir acordo com cor", () => {
  const category = classifyAdjustmentCategory(
    "Calendário da campanha",
    "As datas precisam ser alteradas para que fiquem de acordo com o início da campanha na semana do dia 27.",
  );

  expect(category).toEqual({ id: "schedule", label: "Data e programação" });
});

test("usa palavras completas ao classificar pedidos de ajuste", () => {
  expect(classifyAdjustmentCategory("Publicação", "Precisa ficar de acordo com o briefing."))
    .toEqual({ id: "schedule", label: "Data e programação" });
  expect(classifyAdjustmentCategory("Revisão geral", "Precisa ficar de acordo com o briefing."))
    .toEqual({ id: "other", label: "Outros ajustes" });
});

test("dá mais peso ao comentário do que ao título do conteúdo", () => {
  const category = classifyAdjustmentCategory(
    "Imagem principal",
    "Alterar as datas, a semana e o dia da publicação.",
  );

  expect(category).toEqual({ id: "schedule", label: "Data e programação" });
});

test("mantém pedidos realmente visuais na categoria correta", () => {
  const category = classifyAdjustmentCategory(
    "Peça principal",
    "Trocar a imagem e ajustar as cores da arte.",
  );

  expect(category).toEqual({ id: "visual", label: "Visual e identidade" });
});
