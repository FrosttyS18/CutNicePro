import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) {
  const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
  if (await projetos.count()) {
    await projetos.click(); await sleep(1800);
    await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 });
    await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200);
  }
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1500);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2500);
}
console.log("editor:", await page.locator('[data-testid="video-editor"]').count(), "| h1:", await page.locator(".editor-header h1").count());
await browser.close().catch(() => {});
