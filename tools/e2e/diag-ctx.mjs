import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
await page.keyboard.press("F7"); await sleep(250);
console.log("ativo:", await page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo")));
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
// seleciona o h1 primeiro (para existir registro)
await page.mouse.click(box.x + 30, box.y + box.height / 2); await sleep(300);
const total = await page.evaluate(() => (window.__pointerV5?.registros ?? []).length);
console.log("registros:", total);
// dispara contextmenu SINTETICO no h1 (a via do mouse real: pointerdown→contextmenu)
const st = await page.evaluate(() => {
  const alvo = document.querySelector(".editor-header h1");
  const r = alvo.getBoundingClientRect();
  const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.x + 30, clientY: r.y + 12, button: 2 });
  alvo.dispatchEvent(ev);
  const menus = [...document.querySelectorAll("body > div")].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none");
  return { menus: menus.length };
});
console.log("pos-contextmenu sintetico:", JSON.stringify(st));
await browser.close().catch(() => {});
