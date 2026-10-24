import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { execSync } from "node:child_process";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
function mem(label) {
  const out = execSync(`powershell -NoProfile -Command "(Get-Process cutnicepro,msedgewebview2 -EA 0 | Measure-Object WorkingSet64 -Sum).Sum / 1MB"`, {encoding:"utf8"});
  console.log(`[MEM] ${label}: ${Math.round(parseFloat(out.trim()))}MB`);
}
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => x.textContent.includes("Cortes ("));
  if (b) b.click();
});
await sleep(2000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button,[aria-label]")].find(x => (x.getAttribute("aria-label")||"").startsWith("Ver clipe") || x.className.includes("clip-card__open"));
  if (b) b.click();
});
await sleep(1500);
await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find(x => x.textContent.includes("Editar clipe"));
  if (b) b.click();
});
await sleep(3000);
mem("editor-aberto");
const surface = await page.locator(".timeline-surface").boundingBox().catch(() => null);
if (!surface) { console.log("SURFACE_NOT_FOUND"); process.exit(1); }
const y = surface.y + 40;
await page.mouse.move(surface.x + surface.width * 0.2, y);
await page.mouse.down();
const t0 = Date.now();
while (Date.now() - t0 < 8000) {
  const p = (Date.now() - t0) / 8000;
  const x = surface.x + surface.width * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(p * Math.PI * 8)));
  await page.mouse.move(x, y);
  await sleep(50);
}
await page.mouse.up();
mem("pos-scrub-8s");
await sleep(5000);
mem("parado-5s");
const js = await page.evaluate(() => ({
  heap: Math.round((performance.memory && performance.memory.usedJSHeapSize) / 1048576) || 0,
  videos: document.querySelectorAll("video").length,
}));
console.log("[JS]", JSON.stringify(js));
await browser.close().catch(() => {});
