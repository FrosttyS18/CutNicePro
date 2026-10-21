import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
await page.keyboard.press("F7"); await sleep(250);
if ((await page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo"))) !== "1") {
  await page.keyboard.press("F7"); await sleep(250);
}
console.log("inspector ligado:", await page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo")));
const estado = async () => await page.evaluate(() => (window.__pointerV5?.registros ?? []).map(r => ({ n: r.n, pedido: r.pedido, tag: r.objeto.tag })));
await page.keyboard.press("F7"); await sleep(250);
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
await page.mouse.move(box.x + 30, box.y + box.height / 2); await sleep(150);
await page.mouse.down(); await page.mouse.up(); await sleep(350);
let abriu = await page.evaluate(() => Boolean(document.querySelector('input[placeholder^="O que ajustar"]')));
if (!abriu) { // re-medir e tentar uma vez (layout pode assentar após abrir o editor)
  const b2 = await h1.boundingBox().catch(() => null);
  if (b2) { await page.mouse.move(b2.x + 30, b2.y + b2.height / 2); await sleep(120); await page.mouse.down(); await page.mouse.up(); await sleep(350); }
  abriu = await page.evaluate(() => Boolean(document.querySelector('input[placeholder^="O que ajustar"]')));
}
if (abriu) await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "pedido original"; i.parentElement.querySelector("button").click(); }); await sleep(250);
console.log("apos selecionar h1:", JSON.stringify(await estado()));
// clique-direito real
await page.mouse.move(box.x + 30, box.y + box.height / 2); await sleep(120);
await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); await sleep(350);
console.log("apos clique-direito:", JSON.stringify(await estado()));
const menuAberto = await page.evaluate(() => [...document.documentElement.children].some(d => d.textContent.includes("Editar comentário") && d.style.display !== "none"));
console.log("menu aberto:", menuAberto);
if (menuAberto) {
  await page.evaluate(() => {
    const menus = [...document.documentElement.children].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none");
    [...menus[menus.length - 1].children].find(i => i.textContent.includes("Editar")).click();
  }); await sleep(250);
  const pre = await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); return i ? i.value : "(sem caixa)"; });
  console.log("pre-preenchido:", JSON.stringify(pre));
  await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "pedido EDITADO"; i.parentElement.querySelector("button").click(); }); await sleep(250);
  console.log("apos editar:", JSON.stringify(await estado()));
}
// limpa
await page.evaluate(() => { sessionStorage.removeItem("pointer-v5-registros"); if (window.__pointerV5) window.__pointerV5.registros.length = 0; });
await page.keyboard.press("F7"); await sleep(200);
console.log("limpo; F7 desligado");
await browser.close().catch(() => {});
