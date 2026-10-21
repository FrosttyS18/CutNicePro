import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const erros = [];
page.on("pageerror", e => erros.push(String(e).slice(0, 200)));
console.log("injetado:", await page.evaluate(() => Boolean(window.__pointerV4)));
console.log("ativo antes:", await page.evaluate(() => sessionStorage.getItem("pointer-v4-ativo")));
await page.keyboard.press("F7"); await sleep(300);
console.log("ativo apos F7:", await page.evaluate(() => sessionStorage.getItem("pointer-v4-ativo")));
const box = await page.locator(".editor-header h1").first().boundingBox();
console.log("h1 box:", JSON.stringify(box));
await page.mouse.click(box.x + 30, box.y + box.height / 2);
await sleep(500);
const st = await page.evaluate(() => ({
  input: Boolean(document.querySelector('input[placeholder^="O que ajustar"]')),
  contorno: [...document.querySelectorAll("#pointer-v4-overlay > div")].length,
}));
console.log("pos-clique:", JSON.stringify(st), "| pageerrors:", erros);
await browser.close().catch(() => {});
