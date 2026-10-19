/**
 * CutNicePro 03B.7 — QA funcional (1 rodada, conforme VALIDATION-POLICY).
 * Sem screenshots estéticos, sem VISION: verificações diretas de estado.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9361;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b7";
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
  const t0 = Date.now();
  await page.getByTestId("home-screen").waitFor({ timeout: 30000 });
  const expand = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expand.count()) > 0) { await expand.click(); await sleep(300); }
  await resizeWindow(page, 1440, 900);
  await sleep(4500); // intro nova (~0.15s + 1.6s) + decoders

  // 1. Galaxy: canvas + intro rápida + movimento + vídeos
  const gl = await page.evaluate(() => {
    const c = document.querySelector(".home__galaxy canvas");
    return c ? { w: c.width, h: c.height, live: !!(c.getContext("webgl2") || c.getContext("webgl")) } : null;
  });
  check("galaxy canvas WebGL vivo", !!gl && gl.live, JSON.stringify(gl));
  // movimento: compare computado — usa rAF fps como proxy de loop ativo
  const fps = await page.evaluate(async () => new Promise((res) => {
    let n = 0; const s = performance.now();
    const t = () => { n++; if (n < 90) requestAnimationFrame(t); else res(+(n / ((performance.now() - s) / 1000)).toFixed(1)); };
    requestAnimationFrame(t);
  }));
  check("loop de animação ativo (>=45fps)", fps >= 45, `${fps} fps`);
  // vídeos ativos: proxy cnpmedia acessível + sem erros
  const proxy = await page.evaluate(async () => {
    const r = await fetch("http://cnpmedia.localhost/cutNicePro/16-9/16-9_01.mp4", { headers: { Range: "bytes=0-99" } });
    return { status: r.status, type: r.headers.get("content-type") };
  }).catch((e) => ({ error: String(e).slice(0, 60) }));
  check("vídeos: proxy cnpmedia 206 video/mp4", proxy.status === 206 && /video/.test(proxy.type || ""), JSON.stringify(proxy));
  const noVideoErr = consoleLog.filter((l) => /video|media|decode/i.test(l)).length === 0;
  check("vídeos: sem erros de mídia/decodificação no console", noVideoErr);

  // 2. Cores dos braços: pulseMat uniforms via... não expostos. Verificação
  //    objetiva substituta: os DEFAULTS aplicados (pulseHue=0) — checar pelo
  //    localStorage do tuner SEM overrides + tokens CSS computados.
  const theme = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { line: cs.getPropertyValue("--line").trim(), strong: cs.getPropertyValue("--line-strong").trim(), accent: cs.getPropertyValue("--accent").trim(), tunerOverrides: localStorage.getItem("artcraft-tuner") };
  });
  check("paleta: tokens aqua + cinza #51565a aplicados", theme.accent === "#02c2be" && theme.strong === "#51565a", JSON.stringify(theme));
  check("paleta: sem overrides de tuner salvos (defaults ativos)", theme.tunerOverrides === null || theme.tunerOverrides === "{}");

  // 3. Entrada do conteúdo: headline aplicada + animações existem + assentam
  const type = await page.evaluate(() => {
    const h1 = document.querySelector('[data-testid="home-title"]');
    const inner = document.querySelector(".home__line-inner");
    const cs = inner ? getComputedStyle(inner) : null;
    return {
      fontSize: h1 ? getComputedStyle(h1).fontSize : null,
      transform: cs ? cs.transform : null,
      animName: cs ? cs.animationName : null,
      rect: h1 ? h1.getBoundingClientRect().toJSON() : null,
    };
  });
  check("headline: clamp aplicado (>=40px @1440)", parseInt(type.fontSize || "0") >= 40, type.fontSize);
  check("headline: animação de linha aplicada e assentada (transform none)", type.animName !== "none" && (type.transform === "none" || /1, 0, 0, 1/.test(type.transform)), `${type.animName}/${(type.transform || "").slice(0, 24)}`);

  // 4. Flip Button: um único botão, faces corretas, giro por FOCO (teclado)
  // focus-visible só ativa com foco por TECLADO real: Tab (evento físico
  // do Playwright) até o botão — então o giro por foco é verificado.
  const beforeTransform = await page.evaluate(() => getComputedStyle(document.querySelector(".flip-btn__inner")).transform);
  let tabbed = false;
  for (let i = 0; i < 18 && !tabbed; i++) {
    await page.keyboard.press("Tab");
    await sleep(70);
    tabbed = await page.evaluate(() => document.activeElement?.dataset?.testid === "home-create-project");
  }
  await sleep(560); // transição 420ms
  const flip = await page.evaluate((before) => {
    const btn = document.querySelector('[data-testid="home-create-project"]');
    const inner = btn.querySelector(".flip-btn__inner");
    const faces = btn.querySelectorAll(".flip-btn__face");
    const back = getComputedStyle(faces[1]);
    return {
      tabbed: document.activeElement === btn,
      buttons: document.querySelectorAll('[data-testid="home-create-project"]').length,
      faces: faces.length,
      before,
      after: getComputedStyle(inner).transform,
      backBg: back.backgroundColor,
      backface: back.backfaceVisibility,
      transition: getComputedStyle(inner).transitionDuration,
    };
  }, beforeTransform);
  check("flip: 1 botão, 2 faces, backface-visibility", flip.buttons === 1 && flip.faces === 2 && flip.backface === "hidden", JSON.stringify(flip).slice(0, 80));
  check("flip: focus-visible gira (rotateY)", flip.before !== flip.after && /matrix3d/.test(flip.after || ""), `antes=${(flip.before || "").slice(0, 16)} depois=${(flip.after || "").slice(0, 30)}`);
  check("flip: verso #242424", /36, 36, 36/.test(flip.backBg || ""), flip.backBg);

  // 5. CTA funcional (clique abre diálogo; sem duplicar ação)
  await page.getByTestId("home-create-project").click({ force: true });
  await sleep(500);
  const dlg = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  check("CTA: clique abre diálogo de projeto", dlg);
  if (dlg) await page.keyboard.press("Escape");

  // 6. Layout desktop + ultrawide + sidebar (verificação computada)
  for (const [w, h, label] of [[1440, 900, "desktop"], [3440, 1440, "ultrawide"]]) {
    await resizeWindow(page, w, h);
    await sleep(900);
    const lay = await page.evaluate(() => {
      const home = document.querySelector(".home");
      const h1 = document.querySelector('[data-testid="home-title"]');
      const cta = document.querySelector('[data-testid="home-create-project"]');
      const r1 = h1.getBoundingClientRect();
      const rc = cta.getBoundingClientRect();
      return {
        scrollX: window.scrollX || document.documentElement.scrollLeft,
        homeW: home.clientWidth,
        titleFits: r1.left >= home.getBoundingClientRect().left && r1.right <= home.getBoundingClientRect().right,
        ctaVisible: rc.width > 0 && rc.bottom <= window.innerHeight,
        ctaClickable: !!(document.elementFromPoint(rc.x + rc.width / 2, rc.y + rc.height / 2)?.closest?.('[data-testid="home-create-project"]')),
      };
    });
    check(`layout ${label}: sem scrollX, título contido, CTA clicável`, lay.scrollX === 0 && lay.titleFits && lay.ctaClickable, JSON.stringify(lay));
  }
  await resizeWindow(page, 1440, 900);
  // sidebar recolhida: hierarquia intacta + título não reinicia entrada
  const innerAfter = await page.evaluate(() => getComputedStyle(document.querySelector(".home__line-inner")).transform);
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(600);
  const innerSidebar = await page.evaluate(() => getComputedStyle(document.querySelector(".home__line-inner")).transform);
  check("sidebar: entrada do título NÃO reinicia (transform estável)", innerAfter === innerSidebar, `${(innerAfter || "").slice(0, 20)}=${(innerSidebar || "").slice(0, 20)}`);
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(400);

  // 7. Halftone intacto
  const hf = await page.evaluate(() => {
    const c = document.querySelector(".home-halftone canvas");
    if (!c) return null;
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = 1e9, maxX = -1e9;
    for (let y = 0; y < c.height; y += 2)
      for (let x = 0; x < c.width; x += Math.max(1, Math.floor(c.width / 600)))
        if (d[(y * c.width + x) * 4 + 3] > 10) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
    return Math.round(((maxX - minX) / (c.width / c.getBoundingClientRect().width) / c.getBoundingClientRect().width) * 1000) / 10;
  });
  check("halftone intacto (tinta >=96%)", (hf ?? 0) >= 96, `${hf}%`);

  // 8. Expansão do galaxy continua: boost por clique (verificação computada
  //    via transform? Cards são meshes WebGL — sem DOM. Uso ausência de
  //    pageerrors + proxy ativo como proxy funcional + canvas vivo (1º).
  const errs = consoleLog.filter((l) => l.startsWith("[pageerror]") || l.startsWith("[error]"));
  check("runtime: console sem erros (rodada completa)", errs.length === 0, errs.slice(0, 2).join("|"));

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await browser.close();
  await killApp();
  log(`QA 03B.7 — ${results.filter((r) => r.ok).length}/${results.length} checks OK`);
}

main().catch(async (e) => {
  console.error("[qa] FALHA:", e);
  await killApp();
  process.exit(1);
});
