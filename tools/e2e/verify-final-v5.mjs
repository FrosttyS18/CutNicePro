import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
const ativo = () => page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo"));
// garante DESLIGADO primeiro, depois LIGA (estado determinístico)
if ((await ativo()) === "1") { await page.keyboard.press("F7"); await sleep(200); }
await page.keyboard.press("F7"); await sleep(250);
console.log("1) ligado:", (await ativo()) === "1");
const h1 = page.locator(".editor-header h1").first();
let box = await h1.boundingBox();
// 2) pai: clicar, comentar, registrar
await page.mouse.move(box.x + 30, box.y + box.height / 2); await sleep(150);
await page.mouse.down(); await page.mouse.up(); await sleep(350);
let caixa = await page.evaluate(() => Boolean(document.querySelector('input[placeholder^="O que ajustar"]')));
if (caixa) {
  await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "pedido do PAI"; i.parentElement.querySelector("button").click(); });
  await sleep(250);
}
console.log("2) pai selecionado+comentado:", caixa);
// 3) filho dentro do pai (ícone)
const icone = page.locator(".editor-icon-button").first();
const bi = await icone.boundingBox();
await page.mouse.move(bi.x + bi.width / 2, bi.y + bi.height / 2); await sleep(120);
await page.mouse.down(); await page.mouse.up(); await sleep(350);
caixa = await page.evaluate(() => Boolean(document.querySelector('input[placeholder^="O que ajustar"]')));
if (caixa) {
  await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "pedido do FILHO"; i.parentElement.querySelector("button").click(); });
  await sleep(250);
}
console.log("3) filho selecionado+comentado:", caixa);
// 4) clique-direito no PAI (coords do h1) → menu → Editar → novo texto
await page.mouse.move(box.x + 30, box.y + box.height / 2); await sleep(120);
await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); await sleep(350);
const menuAberto = await page.evaluate(() => [...document.documentElement.children].some(d => d.textContent.includes("Editar comentário") && d.style.display !== "none"));
console.log("4) menu contexto aberto:", menuAberto);
if (menuAberto) {
  await page.evaluate(() => {
    const menus = [...document.documentElement.children].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none");
    [...menus[menus.length - 1].children].find(i => i.textContent.includes("Editar")).click();
  }); await sleep(300);
  const pre = await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); return i ? i.value : "(sem)"; });
  await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); if (i) { i.value = "pedido do PAI EDITADO"; i.parentElement.querySelector("button").click(); } }); await sleep(250);
  console.log("5) edição pré-preenchida com:", JSON.stringify(pre));
}
const registros = await page.evaluate(() => (window.__pointerV5?.registros ?? []).map(r => ({ n: r.n, pedido: r.pedido, tag: r.objeto.tag })));
console.log("6) registros finais:", JSON.stringify(registros));
// limpa + desliga
await page.evaluate(() => { sessionStorage.removeItem("pointer-v5-registros"); if (window.__pointerV5) window.__pointerV5.registros.length = 0; });
if ((await ativo()) === "1") { await page.keyboard.press("F7"); await sleep(200); }
console.log("7) limpo e desligado:", (await ativo()) === "0");
await browser.close().catch(() => {});
