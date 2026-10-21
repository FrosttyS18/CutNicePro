import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
await page.keyboard.press("F7"); await sleep(250);
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
const ponto = { x: box.x + 30, y: box.y + box.height / 2 };
const info = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  const cadeia = [];
  let n = el;
  while (n && cadeia.length < 4) {
    const cs = getComputedStyle(n);
    cadeia.push(`${n.tagName}.${String(n.className).split(" ")[0] || ""} pe=${cs.pointerEvents} z=${cs.zIndex}`);
    n = n.parentElement;
  }
  return { hit: cadeia, ativo: sessionStorage.getItem("pointer-v5-ativo"), injetado: Boolean(window.__pointerV5) };
}, ponto);
console.log(JSON.stringify(info, null, 1));
// simula o clique real via eventos (pointerdown+up+click) no alvo
await page.evaluate((ponto) => {
  const alvo = document.elementFromPoint(ponto.x, ponto.y);
  for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    alvo.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: ponto.x, clientY: ponto.y, button: 0 }));
  }
}, ponto);
await sleep(400);
console.log("caixa apos clique sintetico:", await page.evaluate(() => Boolean(document.querySelector('input[placeholder^="O que ajustar"]'))));
console.log("pageerrors?:", "ver log");
await browser.close().catch(() => {});
