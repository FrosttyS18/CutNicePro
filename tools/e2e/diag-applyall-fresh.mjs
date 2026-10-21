/** Diagnóstico upd 15: apply-all em app recém-iniciado — o que clipe 2 recebe. */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(2500);
const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith("chrome-error"));
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});
await page.reload(); await sleep(3000);
const abrirEditor = async (clipeIndex) => {
  if (!(await page.locator('[data-testid="video-editor"]').count())) {
    const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
    if (await projetos.count()) {
      await projetos.click(); await sleep(1800);
      await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 });
      await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200);
    }
  }
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1600);
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').nth(clipeIndex).click(); await sleep(1200);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2400);
};

await abrirEditor(0);
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(400);
// escolhe Destaque e aplica a todos
await page.locator(".studio-preset", { hasText: "Destaque" }).first().click(); await sleep(400);
const corClip1 = (await page.locator('input[aria-label="Cor do destaque"]').inputValue()).toUpperCase();
await page.getByRole("button", { name: "Aplicar a todos os cortes" }).click(); await sleep(1500);
const notice = await page.locator(".studio-notice").innerText().catch(() => "?");
console.log(`clip1=${corClip1} notice="${notice}"`);
// vai direto ao clipe 2 (sem voltar à visão geral: gallery path)
await page.getByRole("button", { name: "Voltar ao projeto" }).first().click(); await sleep(1800);
await abrirEditor(1);
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(600);
const corClip2 = (await page.locator('input[aria-label="Cor do destaque"]').inputValue()).toUpperCase();
// introspecção: há quantos botões de preset pressionados? estilo atual:
const modelo = await page.locator(".studio-preset[aria-pressed=\"true\"]").innerText().catch(() => "nenhum");
console.log(`clip2=${corClip2} presetAtivo=${modelo.replace(/\n/g, " ")}`);
await browser.close().catch(() => {});
