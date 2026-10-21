import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser0 = null; const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
await page.keyboard.press("F7"); await sleep(250);
const n = await page.evaluate(() => {
  // um clique sintético num ponto neutro: conta quantas caixas de comentário aparecem
  const alvo = document.querySelector(".editor-header h1");
  const r = alvo.getBoundingClientRect();
  sessionStorage.removeItem("pointer-v5-registros");
  if (window.__pointerV5) window.__pointerV5.registros.length = 0;
  for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    alvo.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 12, button: 0 }));
  }
  return document.querySelectorAll('input[placeholder^="O que ajustar"]').length;
});
await sleep(300);
const sessao = await page.evaluate(() => JSON.parse(sessionStorage.getItem("pointer-v5-registros") || "[]").length);
console.log("caixas abertas por 1 clique:", n, "| registros no sessionStorage:", sessao);
await page.evaluate(() => { sessionStorage.removeItem("pointer-v5-registros"); document.querySelectorAll('input[placeholder^="O que ajustar"]').forEach(i => i.parentElement.remove()); });
await browser.close().catch(() => {});
