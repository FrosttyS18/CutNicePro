import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
const ativo = () => page.evaluate(() => sessionStorage.getItem("pointer-v5-ativo"));
if ((await ativo()) === "1") { await page.keyboard.press("F7"); await sleep(200); }
await page.keyboard.press("F7"); await sleep(250);
console.log("ligado:", (await ativo()) === "1");
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
// registra o pai primeiro
await page.mouse.down(); await page.mouse.up(); await sleep(300);
await page.evaluate(() => { const i = document.querySelector('input[placeholder^="O que ajustar"]'); if (i) { i.value = "x"; i.parentElement.querySelector("button").click(); } }); await sleep(250);
// contextmenu SINTÉTICO no h1
const r1 = await page.evaluate(() => {
  const alvo = document.querySelector(".editor-header h1");
  alvo.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  return [...document.documentElement.children].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none").length;
});
console.log("menus apos sintetico:", r1);
// contextmenu via CDP real (Input.dispatchMouseEvent rightReleased)
await page.mouse.move(box.x + 30, box.y + box.height / 2);
await page.mouse.down({ button: "right" }); await page.mouse.up({ button: "right" }); await sleep(400);
const r2 = await page.evaluate(() => [...document.documentElement.children].filter(d => d.textContent.includes("Editar comentário") && d.style.display !== "none").length);
console.log("menus apos CDP right-click:", r2);
await page.keyboard.press("F7"); await sleep(200);
await browser.close().catch(() => {});
