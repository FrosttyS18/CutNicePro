import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1200);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const peso = await page.evaluate(() => {
  const s = document.querySelector(".transcript-sentence");
  const w = document.querySelector(".transcript-word");
  return {
    sentence: s ? getComputedStyle(s).fontWeight : null,
    word: w ? getComputedStyle(w).fontWeight : null,
  };
});
console.log(JSON.stringify(peso));
await browser.close().catch(() => {});
