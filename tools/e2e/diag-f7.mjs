import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
// espia todas as teclas que chegam à página
await page.evaluate(() => {
  window.__teclas = [];
  window.addEventListener("keydown", e => window.__teclas.push(e.key), true);
});
await page.keyboard.press("F7"); await sleep(300);
console.log("teclas vistas apos F7:", await page.evaluate(() => window.__teclas));
await page.keyboard.press("F8"); await sleep(300);
console.log("teclas vistas apos F8:", await page.evaluate(() => window.__teclas));
// evento sintético: a logica do inspector responde?
const sintetico = await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", bubbles: true }));
  return sessionStorage.getItem("pointer-v4-ativo");
});
console.log("ativo apos sintetico:", sintetico);
await browser.close().catch(() => {});
