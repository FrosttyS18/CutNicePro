import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
// sintético no window (mesma via do handler)
const r1 = await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", bubbles: true }));
  return sessionStorage.getItem("pointer-v5-ativo");
});
console.log("sintetico window:", r1);
// sintético no document (capture do handler é em window; evento em document propaga)
const r2 = await page.evaluate(() => {
  document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "F7", bubbles: true }));
  return sessionStorage.getItem("pointer-v5-ativo");
});
console.log("sintetico body:", r2);
await browser.close().catch(() => {});
