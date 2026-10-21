/**
 * Modo apontar (atualização 13): conecta ao app TAURI REAL via CDP, navega até
 * o editor e injeta um capturador de cliques. Cada clique do mantenedor desenha
 * um marcador numerado na tela e é gravado (coordenadas + elemento) em
 * docs/reports/evidence/editor13/pointer-feedback.json. Ctrl+clique desfaz o
 * último ponto. O script roda em segundo plano até o app fechar.
 */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
import fs from "node:fs";

const PORT = Number(process.env.POINTER_PORT || 9381);
const OUT = "C:/CutNicePro/docs/reports/evidence/editor13/pointer-feedback.json";
const log = (m) => console.log(`[pointer] ${m}`);

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(2500);
const context = browser.contexts()[0];
let page = context.pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});

// Navega até o editor se ainda não estiver nele.
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

// Injeta o modo apontar (idempotente).
await page.evaluate(() => {
  if (window.__pointerFeedbackActive) return "already";
  window.__pointerFeedback = [];
  window.__pointerMarkers = [];
  const overlay = document.createElement("div");
  overlay.id = "pointer-mode-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
  const banner = document.createElement("div");
  banner.textContent = "MODO APONTAR ATIVO — clique onde precisa de ajuste (Ctrl+clique desfaz o último ponto)";
  banner.style.cssText = "position:fixed;top:10px;right:10px;pointer-events:none;background:#e03131;color:#fff;" +
    "font:600 12px system-ui;padding:8px 12px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.45);max-width:420px;";
  overlay.appendChild(banner);
  document.documentElement.appendChild(overlay);

  const describe = (el) => {
    if (!el || el === document.documentElement) return { tag: "html" };
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && parts.length < 6; n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) s += "#" + n.id;
      const cls = (typeof n.className === "string" ? n.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (cls.length) s += "." + cls.join(".");
      const label = n.getAttribute && (n.getAttribute("aria-label") || n.getAttribute("title"));
      if (label) s += `[${label.slice(0, 60)}]`;
      parts.push(s);
    }
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classes: (typeof el.className === "string" ? el.className : "").slice(0, 140) || undefined,
      ariaLabel: (el.getAttribute && el.getAttribute("aria-label")) || undefined,
      text: ((el.innerText || "").replace(/\s+/g, " ").slice(0, 100)) || undefined,
      path: parts.join(" < "),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  };

  const drawMarker = (n, x, y) => {
    const m = document.createElement("div");
    m.textContent = String(n);
    m.style.cssText = `position:absolute;left:${x - 11}px;top:${y - 11}px;width:22px;height:22px;` +
      "border-radius:50%;background:#e03131;color:#fff;border:2px solid #fff;font:700 12px/18px system-ui;" +
      "text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.5);";
    overlay.appendChild(m);
    window.__pointerMarkers.push(m);
  };

  document.addEventListener("click", (ev) => {
    if (ev.ctrlKey || ev.metaKey) {
      const last = window.__pointerMarkers.pop();
      if (last) last.remove();
      window.__pointerFeedback.pop();
      return;
    }
    const n = window.__pointerFeedback.length + 1;
    const record = {
      n,
      x: Math.round(ev.clientX),
      y: Math.round(ev.clientY),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      rota: location.hash || "/",
      horario: new Date().toISOString(),
      elemento: describe(ev.target),
    };
    window.__pointerFeedback.push(record);
    drawMarker(n, ev.clientX, ev.clientY);
  }, true);
  window.__pointerFeedbackActive = true;
  return "injected";
});

fs.writeFileSync(OUT, JSON.stringify({ iniciadoEm: new Date().toISOString(), cliques: [] }, null, 2));
log(`modo apontar injetado — gravando em ${OUT}`);

// Autoteste do mecanismo: um clique real no título (elemento não interativo).
if (await page.locator(".editor-header h1").count()) {
  await page.locator(".editor-header h1").click({ position: { x: 8, y: 4 } }).catch(() => {});
  await sleep(700);
}

let index = 0;
let erros = 0;
while (erros < 5) {
  await sleep(3000);
  let novos = [];
  try {
    const todos = await page.evaluate(() => window.__pointerFeedback ?? []);
    if (Array.isArray(todos) && todos.length > index) { novos = todos.slice(index); index = todos.length; }
  } catch { erros++; continue; }
  erros = 0;
  if (novos.length) {
    const arquivo = JSON.parse(fs.readFileSync(OUT, "utf8"));
    arquivo.cliques.push(...novos);
    fs.writeFileSync(OUT, JSON.stringify(arquivo, null, 2));
    log(`${novos.length} clique(s) gravado(s) — total ${arquivo.cliques.length}`);
  }
}
log("página/app indisponível — encerrando gravação (arquivo preservado).");
await browser.close().catch(() => {});
