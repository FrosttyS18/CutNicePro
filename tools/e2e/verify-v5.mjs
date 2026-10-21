import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const noEditor = await page.locator('[data-testid="video-editor"]').count();
if (!noEditor) { console.log("FORA DO EDITOR — abrir manualmente"); process.exit(2); }
await page.keyboard.press("F7"); await sleep(300);
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
// 1) seleciona o h1 (pai grande)
await page.mouse.click(box.x + 30, box.y + box.height / 2); await sleep(300);
await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "teste PAI"; i.parentElement.querySelector("button").click(); }); await sleep(250);
// 2) seleciona elemento FILHO menor dentro do header (ícone) — bug antigo
const icone = page.locator(".editor-icon-button").first();
const bi = await icone.boundingBox();
await page.mouse.click(bi.x + bi.width / 2, bi.y + bi.height / 2); await sleep(300);
const filhoOk = await page.evaluate(() => {
  const input = document.querySelector('input[placeholder^="O que ajustar"]');
  if (!input) return false;
  input.value = "teste FILHO";
  input.parentElement.querySelector("button").click();
  return true;
}); await sleep(250);
const registros = await page.evaluate(() => (window.__pointerV5?.registros ?? []).map(r => ({ n: r.n, pedido: r.pedido, tag: r.objeto.tag, seletor: r.seletor.slice(0, 50) })));
console.log("filho selecionavel dentro do pai:", filhoOk, JSON.stringify(registros));
// 3) clique-direito no h1 → menu Editar → novo texto
await h1.click({ button: "right" }); await sleep(300);
await page.evaluate(() => {
  const menus = [...document.querySelectorAll("body > div")].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none");
  const menu = menus[menus.length - 1];
  [...menu.children].find(i => i.textContent.includes("Editar")).click();
}); await sleep(300);
await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "teste PAI EDITADO"; i.parentElement.querySelector("button").click(); }); await sleep(250);
const final = await page.evaluate(() => (window.__pointerV5?.registros ?? []).map(r => ({ n: r.n, pedido: r.pedido })));
console.log("pos-edicao:", JSON.stringify(final));
// limpa
await page.evaluate(() => { sessionStorage.removeItem("pointer-v5-registros"); if (window.__pointerV5) window.__pointerV5.registros.length = 0; });
await page.keyboard.press("F7");
console.log("F7 desligado; registros limpos");
await browser.close().catch(() => {});
