import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const passo = async (nome, fn) => {
  try { await fn(); } catch (e) { console.log(`${nome}: ERRO ${String(e).slice(0, 80)}`); }
  const corpo = (await page.locator("body").innerText().catch(() => "")).slice(0, 120).replace(/\n/g, " | ");
  console.log(`${nome}: ${corpo}`);
};
console.log("inicial:", (await page.locator("body").innerText().catch(() => "")).slice(0, 100).replace(/\n/g, " | "));
await passo("meus-projetos", async () => {
  const b = page.getByRole("button", { name: "Meus Projetos" }).first();
  console.log("  count:", await b.count());
  await b.click();
});
await sleep(1800);
await passo("project-card", async () => {
  console.log("  cards:", await page.locator('[data-testid="project-card"]').count());
  await page.locator('[data-testid="project-card"]').first().click();
});
await sleep(2200);
await passo("cortes", async () => {
  const b = page.getByRole("button", { name: /Cortes \(/ }).first();
  console.log("  count:", await b.count());
  await b.click();
});
await sleep(1800);
await passo("clip-open", async () => {
  console.log("  count:", await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').count());
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click();
});
await sleep(1500);
await passo("editar-clipe", async () => {
  console.log("  count:", await page.getByRole("button", { name: "Editar clipe" }).count());
  await page.getByRole("button", { name: "Editar clipe" }).first().click();
});
await sleep(2500);
console.log("final editor:", await page.locator('[data-testid="video-editor"]').count(), "| h1:", await page.locator(".editor-header h1").count());
await browser.close().catch(() => {});
