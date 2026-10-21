import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const context = browser.contexts()[0];
const page = context.pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});
if (!(await page.locator('[data-testid="video-editor"]').count())) {
  const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
  if (await projetos.count()) { await projetos.click(); await sleep(1800); await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 }); await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200); }
  const cortes = page.getByRole("button", { name: /Cortes \(/ }).first();
  if (await cortes.count()) { await cortes.click(); await sleep(1600); await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200); await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2200); }
}
await page.locator(".editor-inspector__tab", { hasText: "Legendas" }).first().click(); await sleep(500);
const trigger = page.locator('[aria-haspopup="listbox"][aria-label="Posição da legenda"]');
console.log("trigger count:", await trigger.count());
const box = await trigger.boundingBox().catch(() => null);
console.log("trigger box:", box);
await trigger.click(); await sleep(700);
const options = await page.locator('[role="option"]').all();
console.log("options no DOM:", options.length);
for (const o of options.slice(0, 20)) {
  const visible = await o.isVisible().catch(() => false);
  const label = await page.evaluate(el => el.getAttribute("aria-label") || el.textContent, o).catch(() => "?");
  const listLabel = await o.evaluate(el => el.closest('[role="listbox"]')?.getAttribute("aria-label") || "sem-listbox");
  console.log(` option "${label}" visivel=${visible} lista=${listLabel}`);
}
const popover = await page.evaluate(() => {
  const el = document.querySelector('[role="listbox"][aria-label="Posição da legenda"]');
  if (!el) return "listbox inexistente";
  const cs = getComputedStyle(el);
  return { display: cs.display, visibility: cs.visibility, open: el.matches(":popover-open"), rect: el.getBoundingClientRect().toJSON() };
});
console.log("popover Posição:", JSON.stringify(popover).slice(0, 300));
await page.screenshot({ path: "C:/CutNicePro/docs/reports/evidence/editor14/diag-posicao.png" });
await browser.close().catch(() => {});
