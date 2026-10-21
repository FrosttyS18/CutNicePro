import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
await page.keyboard.press("F7"); await sleep(200);
const hit = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  const cadeia = [];
  let n = el;
  while (n && cadeia.length < 5) {
    const cs = getComputedStyle(n);
    cadeia.push(`${n.tagName}.${String(n.className).split(" ")[0]} pe=${cs.pointerEvents}`);
    n = n.parentElement;
  }
  return { em: cadeia };
}, { x: box.x + 30, y: box.y + box.height / 2 });
console.log("hit-test no centro do h1:", JSON.stringify(hit, null, 1));
await page.keyboard.press("F7");
await browser.close().catch(() => {});
