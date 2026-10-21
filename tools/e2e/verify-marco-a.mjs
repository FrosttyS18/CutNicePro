/** Atualização 17 — MARCO A e2e (TAURI REAL). */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const r = {};
if (!(await page.locator('[data-testid="video-editor"]').count())) {
  const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
  if (await projetos.count()) { await projetos.click(); await sleep(1800); await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 }); await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200); }
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1600);
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2400);
}
await page.keyboard.press("Escape"); await sleep(200);
await page.evaluate(() => { const d = document.querySelector(".flow-dialog"); if (d && d.open) d.close(); }); await sleep(200);
const acoes = page.getByRole("button", { name: "Ações do projeto" }).first();
await acoes.dispatchEvent("click"); await sleep(500);
const abriu = await page.evaluate(() => {
  const popover = document.querySelector(".editor-actions__popover");
  if (!popover) return { aberto: false, botoes: [] };
  const botoes = [...popover.querySelectorAll("button")].map(b => b.textContent.trim().slice(0, 35));
  const alvo = [...popover.querySelectorAll("button")].find(b => /Atualizar cortes|Gerar cortes/.test(b.textContent));
  if (alvo) { alvo.click(); return { aberto: true, clicado: alvo.textContent.trim().slice(0, 35), botoes }; }
  return { aberto: true, clicado: null, botoes };
});
console.log("popover:", JSON.stringify(abriu));
await sleep(800);
if (!(await page.locator(".flow-dialog").count())) { console.log(JSON.stringify({ erro: "modal nao abriu", popover: abriu })); process.exit(1); }
r["selo Gemma 4"] = await page.locator(".clip-engine-badge").innerText().catch(() => "(ausente)");
r["seletor Analise removido"] = (await page.locator('[aria-label="Análise"]').count()) === 0;
r["Ajuste do video presente"] = (await page.locator('[aria-haspopup="listbox"][aria-label="Ajuste do vídeo"]').count()) > 0;
const ajusteText = await page.locator('[aria-haspopup="listbox"][aria-label="Ajuste do vídeo"]').innerText().catch(() => "?");
r["opcao padrao"] = ajusteText.includes("Preencher") ? "cover" : ajusteText.includes("Manter") ? "contain" : ajusteText;
r["user-select modal"] = await page.evaluate(() => {
  const dialog = document.querySelector(".flow-dialog");
  const label = dialog?.querySelector(".clip-options label");
  const titulo = dialog?.querySelector("h2");
  const descricao = dialog?.querySelector("p.flow-muted");
  return {
    label: label ? getComputedStyle(label).userSelect : "(sem label)",
    titulo: titulo ? getComputedStyle(titulo).userSelect : "(sem titulo)",
    descricao: descricao ? getComputedStyle(descricao).userSelect : "(sem desc)",
  };
});
r["transcricao selecionavel"] = await page.evaluate(() => {
  const scroll = document.querySelector(".transcript-scroll");
  return scroll ? getComputedStyle(scroll).userSelect : "(sem scroll)";
});
const duracaoText = await page.locator(".flow-dialog").innerText().catch(() => "");
r["texto duracao e teto"] = /Até \d+|teto|máxima/i.test(duracaoText);
await page.keyboard.press("Escape"); await sleep(200);
console.log(JSON.stringify(r, null, 1));
await browser.close().catch(() => {});
