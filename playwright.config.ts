import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // Sequencial entre arquivos também — vários specs (client-dashboard,
  // approval-flow, legacy-coexistence) mutam o MESMO projeto de teste
  // semeado no global-setup; rodar em paralelo causava corrida entre eles.
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: "./tests/global-setup.ts",
  globalTeardown: "./tests/global-teardown.ts",
  use: {
    baseURL: "http://localhost:3210",
    // Removido o executablePath fixo do Edge no Windows — usava um caminho
    // que só existe em máquina Windows, quebrando a suíte em qualquer outro
    // SO (inclusive esta, macOS). Sem essa opção, o Playwright usa o
    // Chromium que ele mesmo baixa (multiplataforma).
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "npx next dev -p 3210",
    url: "http://localhost:3210/",
    env: { ...process.env, STORAGE_DRIVER: "local" },
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
