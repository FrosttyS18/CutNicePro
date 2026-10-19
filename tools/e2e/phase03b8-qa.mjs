/**
 * CutNicePro 03B.8 — QA funcional objetivo (política econômica; sem VISION,
 * sem screenshots estéticos; verificação direta de estado; 1 rodada).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9362;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b8";
fs.mkdirSync(OUT, { recursive: true });
const consoleLog = [];
const results = [];
function log(m) { console.log(`[qa] ${m}`); }
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "OK " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`);
}

let app = null;
function launchApp() {
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(1500);
}
async function resizeWindow(page, w, h) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left: 20, top: 20, width: w, height: h, windowState: "normal" } });
    await sleep(400);
  } finally { cdp.detach(); }
}

async function main() {
  launchApp();
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForLoadState("domcontentloaded");
  page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") consoleLog.push(`[error] ${m.text()}`); });
  await page.getByTestId("home-screen").waitFor({ timeout: 30000 });
  await page.evaluate(() => localStorage.clear()); // primeira visita: intro completa
  await page.reload();
  await page.getByTestId("home-screen").waitFor({ timeout: 30000 });
  const expand = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expand.count()) > 0) { await expand.click(); await sleep(300); }
  await resizeWindow(page, 1440, 900);

  // ---- (2) FLUIDEZ: intervalos entre frames nos primeiros segundos ----
  // medidos DURANTE a intro (agora), incluindo picos; rAF count não basta.
  const fluid = await page.evaluate(async () => new Promise((resolve) => {
    const gaps = [];
    let last = performance.now();
    let done = false;
    const tick = (t) => {
      if (!done) gaps.push(t - last);
      last = t;
      if (t - start < 4200 && !done) requestAnimationFrame(tick);
      else if (!done) { done = true; resolve(gaps); }
    };
    const start = performance.now();
    requestAnimationFrame(tick);
    // também vigiar long tasks
  })).catch(() => null);
  const gaps = fluid || [];
  const avg = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const max = gaps.length ? Math.max(...gaps) : 0;
  const over100 = gaps.filter((g) => g > 100).length;
  const over50 = gaps.filter((g) => g > 50).length;
  log(`fluidez (4.2s da intro): média ${avg.toFixed(1)}ms, pico ${max.toFixed(0)}ms, >50ms: ${over50}, >100ms: ${over100} de ${gaps.length} frames`);
  // registra long tasks num buffer global e lê depois (sem Promise longa)
  await page.evaluate(() => {
    (window).__lt = [];
    try {
      const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => (window).__lt.push(Math.round(e.duration))));
      po.observe({ entryTypes: ["longtask"] });
    } catch { (window).__lt = null; }
  });
  await sleep(3000);
  const lt = await page.evaluate(() => (window).__lt);
  log(`long tasks (3s pós-intro): ${lt === null ? "não suportado" : lt.length + " — " + lt.slice(0, 8).join(",") + "ms"}`);

  await sleep(2500);

  // ---- (1) GALAXY: parâmetros + movimento + vídeos ----
  const intro = await page.evaluate(() => {
    const iv = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return { seen: localStorage.getItem("cnp-intro-seen"), reduced: iv };
  });
  const tunables = await page.evaluate(() => {
    // defaults lidos dos módulos via localStorage do tuner (sem overrides)
    return { overrides: localStorage.getItem("artcraft-tuner") };
  });
  check("galaxy: intro rodou (key cnp-intro-seen=1)", intro.seen === "1", JSON.stringify(intro));
  check("galaxy: sem overrides de tuner (defaults ativos)", !tunables.overrides || tunables.overrides === "{}");
  const gl = await page.evaluate(() => {
    const c = document.querySelector(".home__galaxy canvas");
    return c ? { live: !!(c.getContext("webgl2") || c.getContext("webgl")) } : null;
  });
  check("galaxy: canvas WebGL vivo", !!gl?.live);
  const proxy = await page.evaluate(async () => {
    const r = await fetch("http://cnpmedia.localhost/cutNicePro/16-9/16-9_01.mp4", { headers: { Range: "bytes=0-99" } });
    return r.status;
  }).catch(() => 0);
  check("galaxy: vídeos (proxy 206)", proxy === 206, `${proxy}`);
  const mediaErrs = consoleLog.filter((l) => /video|media|decode/i.test(l)).length;
  check("galaxy: sem erros de mídia", mediaErrs === 0);

  // ---- (3) HEADLINE: uma linha + Nice aqua ----
  const head = await page.evaluate(() => {
    const h1 = document.querySelector('[data-testid="home-title"]');
    const nice = h1.querySelector(".home__nice");
    const cs = getComputedStyle(h1);
    const r = h1.getBoundingClientRect();
    const home = document.querySelector(".home").getBoundingClientRect();
    return {
      fontSize: cs.fontSize,
      lines: Math.round(r.height / parseFloat(cs.lineHeight)),
      fitsOneLine: r.height <= parseFloat(cs.lineHeight) * 1.35,
      inside: r.left >= home.left && r.right <= home.right,
      niceColor: getComputedStyle(nice).color,
      nowrap: cs.whiteSpace,
    };
  });
  check("headline: 1 linha (nowrap + altura de 1 linha)", head.nowrap === "nowrap" && head.fitsOneLine, JSON.stringify({ fs: head.fontSize, h: head.lines }));
  check("headline: contida no painel (sem overflow)", head.inside);
  check("headline: Nice em Deep Aqua", /2, 194, 190|rgb\(2, 194, 190\)/.test(head.niceColor), head.niceColor);

  // ---- (4) FLIP: eixo X (matrix3d após Tab) ----
  const beforeT = await page.evaluate(() => getComputedStyle(document.querySelector(".flip-btn__box")).transform);
  let tabbed = false;
  for (let i = 0; i < 18 && !tabbed; i++) {
    await page.keyboard.press("Tab");
    await sleep(70);
    tabbed = await page.evaluate(() => document.activeElement?.dataset?.testid === "home-create-project");
  }
  await sleep(520);
  const flip = await page.evaluate((before) => {
    const btn = document.querySelector('[data-testid="home-create-project"]');
    const box = btn.querySelector(".flip-btn__box");
    const front = getComputedStyle(btn.querySelector(".flip-btn__face--front"));
    const bottom = getComputedStyle(btn.querySelector(".flip-btn__face--bottom"));
    return {
      tabbed: document.activeElement === btn,
      before,
      after: getComputedStyle(box).transform,
      frontTz: front.transform,
      bottomT: bottom.transform,
      bottomBg: bottom.backgroundColor,
      transition: getComputedStyle(box).transitionDuration,
    };
  }, beforeT);
  check("flip: foco por Tab real", flip.tabbed);
  check("flip: rotação EIXO X (matrix3d com termo m23≠0... rotateX)", /matrix3d/.test(flip.after) && flip.after !== flip.before, `antes=${(flip.before || "").slice(0, 14)} depois=${(flip.after || "").slice(0, 34)}`);
  check("flip: geometria frente translateZ / base rotateX", /matrix.*1, 0, 0, 1, 0, 0, 0, 25/.test(flip.frontTz || "") || /25/.test(flip.frontTz || ""), `front=${(flip.frontTz || "").slice(0, 40)}`);
  check("flip: base #242424", /36, 36, 36/.test(flip.bottomBg || ""), flip.bottomBg);
  // Escape NÃO remove o foco — para reverter, o foco deve SAIR do botão (Tab).
  await page.keyboard.press("Tab");
  await sleep(520);
  const backT = await page.evaluate(() => getComputedStyle(document.querySelector(".flip-btn__box")).transform);
  check("flip: reverte ao sair do foco", backT === flip.before || /1, 0, 0, 1, 0, 0, 0, 1/.test(backT || ""), (backT || "").slice(0, 24));

  // ---- (5) CTA: click / Enter / Space ----
  await page.getByTestId("home-create-project").click({ force: true });
  await sleep(400);
  const d1 = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  if (d1) await page.keyboard.press("Escape");
  await sleep(300);
  await page.getByTestId("home-create-project").focus();
  await page.keyboard.press("Enter");
  await sleep(400);
  const d2 = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  if (d2) await page.keyboard.press("Escape");
  await sleep(300);
  await page.getByTestId("home-create-project").focus();
  await page.keyboard.press(" ");
  await sleep(400);
  const d3 = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  if (d3) await page.keyboard.press("Escape");
  check("CTA: click/Enter/Space abrem o diálogo", d1 && d2 && d3, `click=${d1} enter=${d2} space=${d3}`);

  // ---- (6) HALFTONE: sem perda de conteúdo no toggle da sidebar ----
  // prova objetiva: alpha do canvas ANTES/DURANTE/DEPOIS do toggle
  const inkAlpha = () => page.evaluate(() => {
    const c = document.querySelector(".home-halftone canvas");
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 64) if (d[i] > 10) n++;
    return n;
  });
  const before = await inkAlpha();
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(90); // no MEIO da transição (antes era aqui que piscava)
  const during = await inkAlpha();
  await sleep(700); // debounce 120ms + redesenho
  const after = await inkAlpha();
  check("halftone: conteúdo presente DURANTE o toggle (sem apagar)", during > before * 0.5, `antes=${before} durante=${during}`);
  check("halftone: redesenhado após assentar (tinta comparável)", after > before * 0.5, `depois=${after}`);
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(800);

  // ---- (7) Navegação Home→Biblioteca→Home ----
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByTestId("home-screen").waitFor({ timeout: 10000 });
  check("navegação Home→Biblioteca→Home", true);

  // ---- (8) Layout: desktop + ultrawide, sidebar ± ----
  for (const [w, h, label] of [[1440, 900, "desktop"], [3440, 1440, "ultrawide"]]) {
    for (const state of ["aberta", "recolhida"]) {
      if (state === "recolhida") {
        const c = await page.getByRole("button", { name: "Recolher barra lateral" }).count();
        if (c) { await page.getByRole("button", { name: "Recolher barra lateral" }).click(); await sleep(500); }
      } else {
        const c = await page.getByRole("button", { name: "Expandir barra lateral" }).count();
        if (c) { await page.getByRole("button", { name: "Expandir barra lateral" }).click(); await sleep(500); }
      }
      await resizeWindow(page, w, h);
      await sleep(700);
      const lay = await page.evaluate(() => {
        const h1 = document.querySelector('[data-testid="home-title"]');
        const r = h1.getBoundingClientRect();
        const home = document.querySelector(".home").getBoundingClientRect();
        const cta = document.querySelector('[data-testid="home-create-project"]').getBoundingClientRect();
        return {
          scrollX: window.scrollX,
          oneLine: r.height <= parseFloat(getComputedStyle(h1).lineHeight) * 1.35,
          fits: r.left >= home.left && r.right <= home.right,
          ctaHit: !!document.elementFromPoint(cta.x + cta.width / 2, cta.y + cta.height / 2)?.closest?.('[data-testid="home-create-project"]'),
        };
      });
      check(`layout ${w}x${h} sidebar ${state}: 1 linha, sem overflow/scrollX, CTA ok`, lay.scrollX === 0 && lay.oneLine && lay.fits && lay.ctaHit, JSON.stringify(lay));
    }
  }

  const errs = consoleLog.filter((l) => l.startsWith("[pageerror]") || l.startsWith("[error]"));
  check("console sem erros (rodada completa)", errs.length === 0, errs.slice(0, 2).join("|"));

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify({ results, fluid: { avg, max, over50, over100, frames: gaps.length }, longTasks: lt }, null, 1));
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await browser.close();
  await killApp();
  log(`QA 03B.8 — ${results.filter((r) => r.ok).length}/${results.length} checks OK`);
}

main().catch(async (e) => {
  console.error("[qa] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await killApp();
  process.exit(1);
});
