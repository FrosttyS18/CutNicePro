import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
console.log("url:", page.url().slice(0, 60));
console.log("editor:", await page.locator('[data-testid="video-editor"]').count());
console.log("injetado:", await page.evaluate(() => Boolean(window.__pointerV5)));
console.log("ativo sessao:", await page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo")));
await page.keyboard.press("F7"); await sleep(250);
console.log("ativo apos F7:", await page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo")));
// sintético: o handler único responde?
const sintetico = await page.evaluate(() => {
  const alvo = document.querySelector(".editor-header h1");
  if (!alvo) return "h1 ausente";
  const r = alvo.getBoundingClientRect();
  for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    alvo.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 12, button: 0 }));
  }
  return document.querySelectorAll('input[placeholder^="O que ajustar"]').length;
});
console.log("caixas apos sintetico:", sintetico);
await browser.close().catch(() => {});
