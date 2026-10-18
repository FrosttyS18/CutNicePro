/**
 * CutNicePro 03B.3 — QA VISUAL (não destrutivo).
 *
 * Matriz de resoluções com métricas estruturais ANTES das capturas:
 *   - hero: bounds, nº de cartões, larguras min/máx, centralização da órbita,
 *     sobreposições, CTA não interceptado;
 *   - halftone: bounds do canvas, bounding box dos glifos (alpha), clipping
 *     lateral (alpha tocando as bordas), faixa opaca (fundo do root);
 *   - sidebar: EXATAMENTE 1 toggle, posicionado ANTES do breadcrumb;
 *   - interações: movimento do hero, pointer/clique/retorno do halftone,
 *     teclado no toggle, redimensionamento contínuo.
 * Evidências em docs/reports/evidence/03b3/.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9340;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b3";
const consoleLog = [];
const RESOLUTIONS = [
  [1280, 720],
  [1440, 900],
  [1920, 1080],
  [2560, 1080],
  [3440, 1440],
  [3840, 1600],
];

fs.mkdirSync(OUT, { recursive: true });
const report = [];

function log(msg) {
  console.log(`[qa] ${msg}`);
}

let app = null;

function launchApp() {
  app = spawn(EXE, [], {
    stdio: "ignore",
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  });
}

async function killApp() {
  if (!app || app.exitCode !== null) return;
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(1500);
}

async function waitForCdp(retries = 60) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        if (targets.some((t) => t.type === "page")) return true;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error("CDP não ficou disponível");
}

async function resizeWindow(page, width, height) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left: 20, top: 20, width, height, windowState: "normal" } });
    await sleep(350);
  } finally {
    await cdp.detach();
  }
}

/** Métricas estruturais da Home no estado atual. */
function collectMetrics() {
  const hero = document.querySelector(".home__orbit");
  const heroRect = hero ? hero.getBoundingClientRect() : null;
  const cards = [...document.querySelectorAll(".orbit__card")].map((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, op: parseFloat(el.style.opacity || "1") };
  });
  const visibleCards = cards.filter((c) => c.op > 0.15 && c.w > 4);
  const widths = visibleCards.map((c) => c.w);
  const heroCx = heroRect ? heroRect.x + heroRect.width / 2 : 0;
  const heroCy = heroRect ? heroRect.y + heroRect.height / 2 : 0;
  const meanCx = visibleCards.length ? visibleCards.reduce((s, c) => s + c.x + c.w / 2, 0) / visibleCards.length : 0;
  const meanCy = visibleCards.length ? visibleCards.reduce((s, c) => s + c.y + c.h / 2, 0) / visibleCards.length : 0;

  // Halftone: bbox dos glifos por alpha do canvas + clipping lateral.
  const cEl = document.querySelector(".home-halftone canvas");
  const hfRoot = document.querySelector(".home-halftone .hwf-root");
  const hfRect = cEl ? cEl.getBoundingClientRect() : null;
  let glyph = null;
  let sideClip = null;
  let opaquePlate = null;
  if (cEl) {
    const ctx = cEl.getContext("2d");
    const d = ctx.getImageData(0, 0, cEl.width, cEl.height).data;
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, count = 0;
    const W = cEl.width, H = cEl.height;
    const step = Math.max(1, Math.floor(W / 400));
    for (let y = 0; y < H; y += 2) {
      for (let x = 0; x < W; x += step) {
        if (d[(y * W + x) * 4 + 3] > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          count++;
        }
      }
    }
    glyph = count ? { minX, maxX, minY, maxY, W, H } : null;
    // alpha presente na coluna 0 ou na última → glifo cortado na lateral
    let edge0 = 0, edge1 = 0;
    for (let y = 0; y < H; y += 2) {
      if (d[(y * W) * 4 + 3] > 10) edge0++;
      if (d[(y * W + W - 1) * 4 + 3] > 10) edge1++;
    }
    sideClip = { left: edge0, right: edge1 };
    opaquePlate = hfRoot ? getComputedStyle(hfRoot).backgroundColor : null;
  }

  // Sidebar: exatamente 1 toggle, antes do breadcrumb.
  const toggles = [...document.querySelectorAll(".panel-toggle")];
  const bc = document.querySelector(".breadcrumb");
  const toggle = toggles[0];
  const toggleBefore =
    toggles.length === 1 && toggle && bc
      ? toggle.getBoundingClientRect().right <= bc.getBoundingClientRect().left + 2
      : false;

  // CTA não interceptado.
  const cta = document.querySelector('[data-testid="home-create-project"]');
  let ctaHit = null;
  if (cta) {
    const r = cta.getBoundingClientRect();
    ctaHit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === cta;
  }

  return {
    hero: heroRect ? { x: Math.round(heroRect.x), y: Math.round(heroRect.y), w: Math.round(heroRect.width), h: Math.round(heroRect.height) } : null,
    cardsTotal: cards.length,
    cardsVisible: visibleCards.length,
    cardWMin: widths.length ? Math.round(Math.min(...widths)) : 0,
    cardWMax: widths.length ? Math.round(Math.max(...widths)) : 0,
    orbitCenterDelta: { dx: Math.round(meanCx - heroCx), dy: Math.round(meanCy - heroCy) },
    halftone: hfRect ? { w: Math.round(hfRect.width), h: Math.round(hfRect.height) } : null,
    glyph: glyph ? { left: glyph.minX, right: glyph.W - glyph.maxX, top: glyph.minY, bottom: glyph.H - glyph.maxY } : null,
    sideClip,
    opaquePlate,
    toggleCount: toggles.length,
    toggleBefore,
    ctaHit,
  };
}

function aquaPixels() {
  const c = document.querySelector(".home-halftone canvas");
  if (!c) return -1;
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let aqua = 0;
  for (let i = 0; i < d.length; i += 16) {
    if (d[i + 1] > 150 && d[i + 2] > 140 && d[i] < 120) aqua++;
  }
  return aqua;
}

async function main() {
  launchApp();
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForLoadState("domcontentloaded");
  page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));

  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  // sidebar normalizada expandida para comparabilidade
  const expand = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expand.count()) > 0) {
    await expand.click();
    await sleep(400);
  }
  await sleep(700);

  for (const [w, h] of RESOLUTIONS) {
    await resizeWindow(page, w, h);
    await sleep(500);
    const m = await page.evaluate(collectMetrics);
    const tag = `${w}x${h}`;
    report.push({ res: tag, ...m });
    const problems = [];
    if (m.toggleCount !== 1 || !m.toggleBefore) problems.push("toggle");
    if (m.ctaHit !== true) problems.push("cta");
    if (m.sideClip && (m.sideClip.left > 0 || m.sideClip.right > 0)) problems.push("clipLateral");
    if (m.glyph && (m.glyph.left < 4 || m.glyph.right < 4)) problems.push("margemGlifos");
    if (m.opaquePlate && m.opaquePlate !== "rgba(0, 0, 0, 0)") problems.push("placaOpaca:" + m.opaquePlate);
    log(`${tag}: cards ${m.cardsVisible}/${m.cardsTotal} (${m.cardWMin}-${m.cardWMax}px) | deltaCentro (${m.orbitCenterDelta.dx},${m.orbitCenterDelta.dy}) | glifos margens l${m.glyph?.left} r${m.glyph?.right} t${m.glyph?.top} b${m.glyph?.bottom} | clip ${JSON.stringify(m.sideClip)} | toggle ${m.toggleCount}/${m.toggleBefore ? "antesDoBreadcrumb" : "POSIÇÃO ERRADA"} | cta ${m.ctaHit}${problems.length ? " | PROBLEMAS: " + problems.join(",") : " | OK"}`);
    if ([1280, 1440, 1920, 2560, 3440].includes(w)) {
      await page.screenshot({ path: path.join(OUT, `home-${tag}.png`) });
    }
  }

  // ---- Interações (1440×900) --------------------------------------------
  await resizeWindow(page, 1440, 900);
  await sleep(500);

  // Hero em movimento.
  const t1 = await page.evaluate(() => [...document.querySelectorAll(".orbit__card")].slice(0, 8).map((e) => e.style.transform));
  await sleep(1500);
  const t2 = await page.evaluate(() => [...document.querySelectorAll(".orbit__card")].slice(0, 8).map((e) => e.style.transform));
  const moved = t1.filter((v, i) => v !== t2[i]).length;
  log(`hero movimento: ${moved}/8 cartões deslocados`);

  // Halftone: pointer → clique → retorno.
  const box = await page.evaluate(() => {
    const r = document.querySelector(".home-halftone").getBoundingClientRect();
    return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.35 };
  });
  const rest = await page.evaluate(aquaPixels);
  await page.mouse.move(box.x, box.y, { steps: 10 });
  await sleep(350);
  const hover = await page.evaluate(aquaPixels);
  await page.screenshot({ path: path.join(OUT, "halftone-ponteiro.png") });
  await page.mouse.down(); await page.mouse.up();
  await sleep(120);
  const click = await page.evaluate(aquaPixels);
  await page.screenshot({ path: path.join(OUT, "halftone-clique.png") });
  await page.mouse.move(30, 30, { steps: 5 });
  await sleep(1100);
  const back = await page.evaluate(aquaPixels);
  log(`halftone aqua: repouso ${rest} → ponteiro ${hover} → clique ${click} → retorno ${back}`);

  // Teclado no toggle (Tab real + Enter).
  let hit = false;
  for (let i = 0; i < 15 && !hit; i++) {
    await page.keyboard.press("Tab");
    await sleep(90);
    hit = await page.evaluate(() => document.activeElement?.className === "panel-toggle");
  }
  if (!hit) throw new Error("Tab não alcançou o toggle");
  const focusVisible = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth);
  await page.screenshot({ path: path.join(OUT, "toggle-foco.png") });
  await page.keyboard.press("Enter");
  await sleep(400);
  const expanded1 = await page.locator(".panel-toggle").getAttribute("aria-expanded");
  await page.keyboard.press("Space");
  await sleep(400);
  const expanded2 = await page.locator(".panel-toggle").getAttribute("aria-expanded");
  log(`teclado: foco outline ${focusVisible}, Enter→${expanded1}, Space→${expanded2}`);

  // Redimensionamento contínuo durante a animação.
  for (const [w, h] of [[1600, 900], [1200, 760], [1800, 1000], [1440, 900]]) {
    await resizeWindow(page, w, h);
  }
  await sleep(400);
  const mRes = await page.evaluate(collectMetrics);
  log(`após resize contínuo: hero ${mRes.hero?.w}×${mRes.hero?.h}, cards visíveis ${mRes.cardsVisible}, cta ${mRes.ctaHit}`);
  if (mRes.ctaHit !== true) throw new Error("CTA perdido após resize contínuo");

  fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(report, null, 1));
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await browser.close();
  await killApp();
  log("QA 03B.3 CONCLUÍDO");
}

main().catch(async (e) => {
  console.error("[qa] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await killApp();
  process.exit(1);
});
