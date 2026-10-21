import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
await page.keyboard.press("F7"); await sleep(250);
console.log("ativo:", await page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo")));
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
console.log("box:", JSON.stringify(box));
await page.mouse.move(box.x + 30, box.y + box.height / 2); await sleep(200);
const hoverInfo = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return el ? `${el.tagName}.${String(el.className).split(" ")[0]}` : "null";
}, { x: box.x + 30, y: box.y + box.height / 2 });
console.log("elementFromPoint no ponto:", hoverInfo);
await page.mouse.down(); await page.mouse.up(); await sleep(400);
console.log("caixa apos click real:", await page.evaluate(() => Boolean(document.querySelector('input[placeholder^="O que ajustar"]'))));
await browser.close().catch(() => {});
