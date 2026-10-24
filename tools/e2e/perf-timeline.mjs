/** Medição de desempenho da timeline (upd 20): latência do playhead,
 * tarefas longas e contagem de renders durante scrub no app real. */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
// navega via DOM direto (robusto contra HMR)
for (let i = 0; i < 3 && !(await page.locator('[data-testid="video-editor"]').count()); i++) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Meus Projetos"));
    if (btn) btn.click();
  }).catch(() => {});
  await sleep(2000);
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Cortes ("));
    if (btn) btn.click();
  }).catch(() => {});
  await sleep(1800);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button,[aria-label]")].find(x => (x.getAttribute("aria-label")||"").startsWith("Ver clipe") || String(x.className).includes("clip-card__open"));
    if (b) b.click();
  }).catch(() => {});
  await sleep(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find(x => x.textContent.includes("Editar clipe"));
    if (b) b.click();
  }).catch(() => {});
  await sleep(2500);
}
const inEditor = (await page.locator('[data-testid="video-editor"]').count()) > 0;
console.log("editor:", inEditor);
if (!inEditor) process.exit(1);

// instrumenta React: conta renders e mede tarefas longas
const stats = await page.evaluate(() => {
  window.__renderCount = 0;
  window.__longTasks = 0;
  const origRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = (cb) => {
    window.__renderCount++;
    return origRaf(cb);
  };
  const obs = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.duration > 50) window.__longTasks++;
    }
  });
  obs.observe({ entryTypes: ["longtask"] });
  return { instrumentado: true };
});
console.log("instrumentação:", JSON.stringify(stats));

// scrub 8s
const surface = await page.locator(".timeline-surface").boundingBox();
if (!surface) { console.log("SURFACE_NOT_FOUND"); process.exit(1); }
const y = surface.y + 40;
await page.mouse.move(surface.x + surface.width * 0.2, y);
await page.mouse.down();
const t0 = performance.now();
let moves = 0;
const moveTimes = [];
while (performance.now() - t0 < 8000) {
  const p = (performance.now() - t0) / 8000;
  const x = surface.x + surface.width * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(p * Math.PI * 8)));
  const m0 = performance.now();
  await page.mouse.move(x, y);
  moveTimes.push(performance.now() - m0);
  moves++;
  await sleep(50);
}
await page.mouse.up();

const result = await page.evaluate(() => ({
  renders: window.__renderCount || 0,
  longTasks: window.__longTasks || 0,
  heapMB: Math.round((performance.memory && performance.memory.usedJSHeapSize) / 1048576) || 0,
}));
const avgMove = (moveTimes.reduce((a, b) => a + b, 0) / moveTimes.length).toFixed(1);
const maxMove = Math.max(...moveTimes).toFixed(1);
console.log(`[PERF] scrub 8s: ${moves} moves, avg move latency ${avgMove}ms, max ${maxMove}ms`);
console.log(`[PERF] rAF calls: ${result.renders}, long tasks (>50ms): ${result.longTasks}, JS heap: ${result.heapMB}MB`);
await browser.close().catch(() => {});
