import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
const ativo = () => page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo"));
if ((await ativo()) === "1") { await page.keyboard.press("F7"); await sleep(200); }
await page.keyboard.press("F7"); await sleep(250);
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
// 1) criar o apontamento
await page.mouse.move(box.x + 30, box.y + box.height / 2); await sleep(120);
await page.mouse.down(); await page.mouse.up(); await sleep(300);
await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); if (i) { i.value = "pedido original"; i.parentElement.querySelector("button").click(); } }); await sleep(250);
console.log("1) apontamento criado:", JSON.stringify(await page.evaluate(() => (window.__pointerV5?.registros ?? []).map(r => ({ n: r.n, pedido: r.pedido })))));
// 2) clique-direito no MESMO ponto (com registro existente)
await page.mouse.move(box.x + 30, box.y + box.height / 2); await sleep(120);
await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); await sleep(350);
const menuAberto = await page.evaluate(() => [...document.querySelectorAll("#pointer-v5-overlay > div")].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none").length);
console.log("2) menu aberto:", menuAberto);
if (menuAberto) {
  // 3) editar
  await page.evaluate(() => {
    const menus = [...document.querySelectorAll("#pointer-v5-overlay > div")].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none");
    [...menus[menus.length - 1].children].find(i => i.textContent.includes("Editar")).click();
  }); await sleep(300);
  const pre = await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); return i ? i.value : "(sem caixa)"; });
  await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); if (i) { i.value = "pedido EDITADO pelo menu"; i.parentElement.querySelector("button").click(); } }); await sleep(250);
  const final = await page.evaluate(() => (window.__pointerV5?.registros ?? []).map(r => ({ n: r.n, pedido: r.pedido })));
  console.log("3) pré-preenchido:", JSON.stringify(pre), "| após editar:", JSON.stringify(final));
}
// limpa
await page.evaluate(() => { sessionStorage.removeItem("pointer-v5-registros"); if (window.__pointerV5) window.__pointerV5.registros.length = 0; });
if ((await ativo()) === "1") { await page.keyboard.press("F7"); await sleep(200); }
console.log("limpo; F7 desligado");
await browser.close().catch(() => {});
