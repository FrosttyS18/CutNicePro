import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const ativo = () => page.evaluate(() => sessionStorage.getItem("pointer-v6-ativo"));
if ((await ativo()) === "1") { await page.keyboard.press("F7"); await sleep(200); }
await page.keyboard.press("F7"); await sleep(250);
console.log("ligado:", (await ativo()) === "1");
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
await page.mouse.down(); await page.mouse.up(); await sleep(300);
await page.evaluate(() => { const i = document.querySelector('input[placeholder="Adicionar comentário"]'); if (i) { i.value = "pedido teste"; i.parentElement.querySelector("button").click(); } }); await sleep(300);
console.log("pings:", await page.evaluate(() => document.querySelectorAll("#pointer-v6-doc > div").length));
const pin = page.locator("#pointer-v6-doc > div").first();
await pin.click(); await sleep(300);
const dump = await page.evaluate(() => [...document.querySelectorAll("#pointer-v6-overlay > div")].map(d => ({
  display: d.style.display || "(herdado)", texto: d.textContent.replace(/\s+/g, " ").slice(0, 60)
})));
console.log("overlay children:", JSON.stringify(dump, null, 1));
await browser.close().catch(() => {});
