/** Medição de memória durante scrub da timeline (atualização 19). */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import { execSync } from "node:child_process";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

function mem(label) {
  const out = execSync(`powershell -NoProfile -Command "Get-Process cutnicepro,msedgewebview2 -ErrorAction SilentlyContinue | Sort-Object WorkingSet64 -Descending | Select-Object ProcessName, Id, @{n='WS_MB';e={[math]::Round($_.WorkingSet64/1MB,1)}}, @{n='Priv_MB';e={[math]::Round($_.PrivateMemorySize64/1MB,1)}} | ConvertTo-Json"`, {encoding: "utf8"});
  const procs = JSON.parse(out);
  const arr = Array.isArray(procs) ? procs : [procs];
  const total = arr.reduce((s,p) => s + p.WS_MB, 0);
  const top = arr.slice(0,3).map(p => `${p.ProcessName}(${p.Id}):${p.WS_MB}MB`).join(" ");
  console.log(`[MEM] ${label}: total=${Math.round(total)}MB | ${top}`);
  return { total, top };
}

const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
mem("app-aberto");

// navega ao editor
for (let attempt = 0; attempt < 2; attempt++) {
  if (await page.locator('[data-testid="video-editor"]').count()) break;
  const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
  if (await projetos.count()) { await projetos.click().catch(()=>{}); await sleep(1800); await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 }); await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200); }
  const cortes = page.getByRole("button", { name: /Cortes \(/ }).first();
  if (await cortes.count()) { await cortes.click().catch(()=>{}); await sleep(1600); await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click().catch(()=>{}); await sleep(1200); await page.getByRole("button", { name: "Editar clipe" }).first().click().catch(()=>{}); await sleep(2500); }
}
mem("editor-aberto");

// seek isolado
const surface = page.locator(".timeline-surface");
const box = await surface.boundingBox();
await page.mouse.click(box.x + box.width * 0.3, box.y + 40); await sleep(1000);
mem("seek-isolado");

// arrasto curto (5 segundos)
const startX = box.x + box.width * 0.2;
const endX = box.x + box.width * 0.8;
await page.mouse.move(startX, box.y + 40);
await page.mouse.down();
const t0 = Date.now();
while (Date.now() - t0 < 5000) {
  const progress = (Date.now() - t0) / 5000;
  const x = startX + (endX - startX) * (0.5 + 0.5 * Math.sin(progress * Math.PI * 6));
  await page.mouse.move(x, box.y + 40);
  await sleep(50);
}
await page.mouse.up();
mem("pos-arrasto-5s");

// para 5s
await sleep(5000);
mem("parado-5s");

// arrasto 10s
await page.mouse.move(startX, box.y + 40);
await page.mouse.down();
const t1 = Date.now();
while (Date.now() - t1 < 10000) {
  const progress = (Date.now() - t1) / 10000;
  const x = startX + (endX - startX) * (0.5 + 0.5 * Math.sin(progress * Math.PI * 10));
  await page.mouse.move(x, box.y + 40);
  await sleep(50);
}
await page.mouse.up();
mem("pos-arrasto-10s");

// para 10s
await sleep(10000);
mem("parado-10s");

// JS heap
const heap = await page.evaluate(() => {
  const entries = performance.getEntriesByType("measure");
  return {
    jsHeapMB: Math.round(performance.memory?.usedJSHeapSize / 1024 / 1024) || "?",
    jsHeapLimit: Math.round(performance.memory?.jsHeapSizeLimit / 1024 / 1024) || "?",
    videoElements: document.querySelectorAll("video").length,
    objectURLs: performance.getEntriesByType("resource").filter(r => r.name.startsWith("blob:")).length,
  };
});
console.log("[JS]", JSON.stringify(heap));

await browser.close().catch(() => {});
console.log("FIM");
