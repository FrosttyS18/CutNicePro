import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
await page.keyboard.press("F7"); await sleep(300);
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
// 1) seleciona o h1 com pedido
await page.mouse.click(box.x + 30, box.y + box.height / 2); await sleep(300);
await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "pedido original"; i.parentElement.querySelector("button").click(); }); await sleep(250);
// 2) clique-direito REAL no h1 (botão do mouse do usuário = contextmenu nativo)
await page.mouse.click(box.x + 30, box.y + box.height / 2, { button: "right" }); await sleep(400);
const menuAberto = await page.evaluate(() => {
  const menus = [...document.documentElement.children].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none");
  return menus.length > 0;
});
console.log("menu de contexto aberto:", menuAberto);
if (menuAberto) {
  // 3) Editar comentário → campo pré-preenchido → novo texto → Salvar
  await page.evaluate(() => {
    const menus = [...document.documentElement.children].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none");
    [...menus[menus.length - 1].children].find(i => i.textContent.includes("Editar")).click();
  }); await sleep(300);
  const preenchido = await page.evaluate(() => {
    const i = document.querySelector('input[placeholder^="O que ajustar"]');
    return i ? i.value : null;
  });
  await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); i.value = "pedido EDITADO via clique-direito"; i.parentElement.querySelector("button").click(); }); await sleep(250);
  const registros = await page.evaluate(() => (window.__pointerV5?.registros ?? []).map(r => ({ n: r.n, pedido: r.pedido })));
  console.log("campo pré-preenchido:", JSON.stringify(preenchido));
  console.log("pos-edicao:", JSON.stringify(registros));
} else {
  console.log("FALHA: menu não abriu no clique-direito real");
}
// limpa
await page.evaluate(() => { sessionStorage.removeItem("pointer-v5-registros"); if (window.__pointerV5) window.__pointerV5.registros.length = 0; });
await page.keyboard.press("F7"); await sleep(200);
console.log("lista zerada; F7 desligado");
await browser.close().catch(() => {});
