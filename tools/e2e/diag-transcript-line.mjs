/**
 * Diagnóstico upd 14: localizar a linha horizontal decorativa no topo do
 * painel de transcrição (clique n2 do mantenedor: x=334, y=188) e medir a
 * largura efetiva do inspetor. Inspeciona borders e pseudo-elementos.
 */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = Number(process.env.DIAG_PORT || 9381);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(1500);
const context = browser.contexts()[0];
const page = context.pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});

// Navega até o editor (app pode ter reiniciado na tela inicial).
if (!(await page.locator('[data-testid="video-editor"]').count())) {
  const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
  if (await projetos.count()) {
    await projetos.click(); await sleep(1800);
    await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 });
    await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200);
  }
  const cortes = page.getByRole("button", { name: /Cortes \(/ }).first();
  if (await cortes.count()) {
    await cortes.click(); await sleep(1600);
    await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200);
    await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2200);
  }
}
await page.screenshot({ path: "C:/CutNicePro/docs/reports/evidence/editor14/antes-1280.png" }).catch(() => {});

const info = await page.evaluate(() => {
  const pane = document.querySelector(".editor-pane--transcript");
  const inspector = document.querySelector(".editor-inspector");
  const layout = document.querySelector(".video-editor .editor-layout");
  const out = { pane: null, children: [], inspector: null, grid: null };
  if (layout) {
    const cs = getComputedStyle(layout);
    out.grid = { columns: cs.gridTemplateColumns, gap: cs.gap };
  }
  if (inspector) {
    const r = inspector.getBoundingClientRect();
    out.inspector = { w: Math.round(r.width), x: Math.round(r.x) };
  }
  const describe = (el, depth) => {
    if (!el || depth > 4) return;
    const cs = getComputedStyle(el);
    const before = getComputedStyle(el, "::before");
    const after = getComputedStyle(el, "::after");
    const r = el.getBoundingClientRect();
    out.children.push({
      tag: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + "." + String(el.className).split(" ")[0],
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      borderTop: cs.borderTop, borderBottom: cs.borderBottom,
      beforeBorder: before.borderBottom !== "none" || before.borderTop !== "none" ? `${before.borderTopWidth} ${before.borderTopStyle} ${before.borderTopColor}|${before.borderBottomWidth} ${before.borderBottomStyle} ${before.borderBottomColor}` : null,
      afterBorder: after.borderBottom !== "none" || after.borderTop !== "none" ? `${after.borderTopWidth} ${after.borderTopStyle} ${after.borderTopColor}|${after.borderBottomWidth} ${after.borderBottomStyle} ${after.borderBottomColor}` : null,
      boxShadow: cs.boxShadow !== "none" ? cs.boxShadow : null,
      background: cs.backgroundColor,
    });
    for (const child of el.children) describe(child, depth + 1);
  };
  if (pane) { const r = pane.getBoundingClientRect(); out.pane = { x: Math.round(r.x), y: Math.round(r.y) }; describe(pane, 0); }
  return out;
});
console.log(JSON.stringify(info, null, 1));
await browser.close().catch(() => {});
