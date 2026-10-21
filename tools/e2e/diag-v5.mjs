import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const erros = [];
page.on("pageerror", e => erros.push(String(e).slice(0, 250)));
console.log("injetado:", await page.evaluate(() => Boolean(window.__pointerV5)));
await page.keyboard.press("F7"); await sleep(300);
console.log("ativo:", await page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo")));
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
console.log("h1:", JSON.stringify(box));
await page.mouse.click(box.x + 30, box.y + box.height / 2); await sleep(400);
const st = await page.evaluate(() => ({
  caixa: Boolean(document.querySelector('input[placeholder^="O que ajustar"]')),
  overlayFilhos: document.querySelectorAll("#pointer-v5-overlay > div").length,
  selecaoAtiva: sessionStorage.getItem("pointer-v5-ativo"),
}));
console.log("pos-clique:", JSON.stringify(st), "| pageerrors:", JSON.stringify(erros));
await browser.close().catch(() => {});
