/** Atualização 15 — captura do inspetor CutNicePro nas 4 abas (TAURI REAL via
 * CDP) para comparação 1:1 com a referência SupoClip (mesma forma de montagem). */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const OUT = "C:/CutNicePro/docs/reports/evidence/editor15";
import fs from "node:fs";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(2000);
const context = browser.contexts()[0];
const page = context.pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});
if (!(await page.locator('[data-testid="video-editor"]').count())) {
  const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
  if (await projetos.count()) {
    await projetos.click(); await sleep(1800);
    await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 });
    await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200);
  }
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1600);
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2400);
}
const panel = page.locator(".editor-inspector");
const medidas = await panel.evaluate((el) => {
  const rect = el.getBoundingClientRect();
  const tabs = el.querySelector(".studio-tabs")?.getBoundingClientRect();
  const tab = el.querySelector(".studio-tab")?.getBoundingClientRect();
  return { painel: { w: Math.round(rect.width), h: Math.round(rect.height) },
    tabs: tabs ? { w: Math.round(tabs.width), h: Math.round(tabs.height) } : null,
    tab: tab ? { w: Math.round(tab.width), h: Math.round(tab.height) } : null };
});
console.log("medidas CNP:", JSON.stringify(medidas));
fs.writeFileSync(`${OUT}/medidas-cnp.json`, JSON.stringify(medidas, null, 2));
const mapa = [["Legendas", "captions"], ["Enquadrar", "framing"], ["Áudio", "audio"], ["Efeitos", "effects"]];
for (const [nome, arquivo] of mapa) {
  await page.locator(".studio-tab", { hasText: nome }).first().click(); await sleep(600);
  await panel.screenshot({ path: `${OUT}/cnp-aba-${arquivo}.png` }).catch(() => console.log(`falha ${nome}`));
}
console.log("abas CNP capturadas");
await browser.close().catch(() => {});
