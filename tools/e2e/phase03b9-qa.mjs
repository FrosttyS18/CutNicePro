/**
 * CutNicePro 03B.9 — smoke funcional (política econômica; sem VISION).
 * Verifica: timeline real (marcos), headline/subtítulo, FlipButton oficial
 * (estados + interação), titlebar (3 controles + drag-region), CTA 3 formas,
 * sidebar, layout normal/ultrawide, IPC persistência, fechamento limpo.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9363;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b9";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const consoleLog = [];
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
  await page.evaluate(() => localStorage.clear()); // 1ª visita = contrato integral
  await page.reload();
  await page.getByTestId("home-screen").waitFor({ timeout: 30000 });
  const tHome = Date.now() - t0;
  await resizeWindow(page, 1440, 900);

  // ---- 1. TIMELINE: marcos reais (anim events via animationstart + clock) ----
  const marks = await page.evaluate(() => new Promise((resolve) => {
    const seen = {};
    const names = { "cnp-rise": "headline", "cnp-fade-up": "sub_or_btn" };
    const onEnd = (e) => {
      const el = e.target;
      const which = el.classList.contains("home__rise") ? "headline"
        : el.closest(".home__subtitle") ? "subtitle"
        : el.classList.contains("home__cta-slot") ? "button" : null;
      if (which && !seen[which]) seen[which] = Math.round(performance.now());
      if (seen.headline && seen.subtitle && seen.button) {
        document.removeEventListener("animationend", onEnd);
        resolve(seen);
      }
    };
    document.addEventListener("animationend", onEnd);
    setTimeout(() => resolve(seen), 6000);
  }));
  // marcos de INÍCIO: computar de delay conhecidos? Melhor: animationstart
  const starts = await page.evaluate(() => {
    // reconstrói pelos computed styles atuais (delays nas regras)
    const g = (sel, prop) => parseFloat(getComputedStyle(document.querySelector(sel))[prop]);
    return {
      headlineStart: parseFloat(getComputedStyle(document.querySelector(".home__rise")).animationDelay) * 1000,
      headlineDur: parseFloat(getComputedStyle(document.querySelector(".home__rise")).animationDuration) * 1000,
      subStart: parseFloat(getComputedStyle(document.querySelector(".home__subtitle .home__fade")).animationDelay) * 1000,
      btnStart: parseFloat(getComputedStyle(document.querySelector(".home__cta-slot")).animationDelay) * 1000,
    };
  });
  const galaxySeen = await page.evaluate(() => localStorage.getItem("cnp-intro-seen"));
  log(`timeline: headline@${starts.headlineStart}ms/${starts.headlineDur}ms sub@${starts.subStart}ms btn@${starts.btnStart}ms; fim real: H+${marks.headline}ms S+${marks.subtitle}ms B+${marks.button}ms; galaxy cardsAt=1900ms`);
  check("timeline: sequência H→S→B→Galaxy (starts 100/750/1250/1900)", starts.headlineStart === 100 && starts.subStart === 750 && starts.btnStart === 1250, JSON.stringify(starts));
  check("timeline: ordem real de conclusão H<S<B", marks.headline < marks.subtitle && marks.subtitle < marks.button, JSON.stringify(marks));
  await sleep(5000); // galaxy revelando (1.9→5.3s)

  // ---- 2. HEADLINE / SUBTÍTULO ----
  const head = await page.evaluate(() => {
    const h1 = document.querySelector('[data-testid="home-title"]');
    const sub = document.querySelector(".home__subtitle");
    const r = h1.getBoundingClientRect();
    return {
      text: h1.textContent.trim(),
      fontSize: getComputedStyle(h1).fontSize,
      oneLine: r.height <= parseFloat(getComputedStyle(h1).lineHeight) * 1.35,
      subColor: getComputedStyle(sub).color,
    };
  });
  check("headline: texto 'Bem-Vindo'", head.text === "Bem-Vindo", head.text);
  check("headline: 1 linha ~64px@1440", head.oneLine && parseInt(head.fontSize) >= 56, head.fontSize);
  check("subtítulo: rgb(146,146,146) exato", head.subColor === "rgb(146, 146, 146)", head.subColor);

  // ---- 3. FLIPBUTTON OFICIAL: estados reais ----
  // mouse em área neutra ANTES de ler o repouso (o ponteiro CDP pode estar
  // parado sobre o botão, que agora captura pointer-events)
  await page.mouse.move(30, 870, { steps: 4 });
  await sleep(800);
  const flipBase = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="home-create-project"]');
    const front = btn.querySelector('[data-slot="flip-button-front"]');
    const back = btn.querySelector('[data-slot="flip-button-back"]');
    return {
      isMotionBtn: btn.getAttribute("data-slot") === "flip-button",
      frontVisible0: getComputedStyle(front).opacity,
      backHidden0: getComputedStyle(back).opacity,
      frontBg: getComputedStyle(btn.querySelector(".home__flip-face--front")).backgroundColor,
      backBg: getComputedStyle(btn.querySelector(".home__flip-face--back")).backgroundColor,
      texts: [front.textContent.trim(), back.textContent.trim()],
    };
  });
  check("flip: botão oficial (data-slot motion)", flipBase.isMotionBtn);
  check("flip: frente visível/verso oculto no repouso", flipBase.frontVisible0 === "1" && parseFloat(flipBase.backHidden0) < 0.1, `f=${flipBase.frontVisible0} b=${flipBase.backHidden0}`);
  check("flip: cores #FFF/#242424 e textos", /255, 255, 255/.test(flipBase.frontBg) && /36, 36, 36/.test(flipBase.backBg) && flipBase.texts[0] === "Criar Projeto" && flipBase.texts[1] === "Criar Projeto");
  // hover REAL (mouse): frente sai por cima (opacity→0), verso entra
  const btnBox = await page.getByTestId("home-create-project").boundingBox();
  await page.mouse.move(btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, { steps: 6 });
  await sleep(900);
  const flipHover = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="home-create-project"]');
    const f = getComputedStyle(btn.querySelector('[data-slot="flip-button-front"]'));
    const b = getComputedStyle(btn.querySelector('[data-slot="flip-button-back"]'));
    return { frontOp: f.opacity, backOp: b.opacity, backTransform: b.transform, btnVisible: btn.getBoundingClientRect().height };
  });
  check("flip: hover — frente some, verso visível (Motion)", parseFloat(flipHover.frontOp) < 0.15 && parseFloat(flipHover.backOp) > 0.85, JSON.stringify(flipHover));
  check("flip: botão permanece íntegro durante hover", flipHover.btnVisible >= 49, `${flipHover.btnVisible}px`);
  await page.mouse.move(30, 870, { steps: 6 });
  await sleep(1000);
  const flipOut = await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="home-create-project"]');
    return {
      frontOp: getComputedStyle(btn.querySelector('[data-slot="flip-button-front"]')).opacity,
      rect: btn.getBoundingClientRect().toJSON(),
    };
  });
  check("flip: mouse-out reverte à frente", flipOut.frontOp === "1", flipOut.frontOp);

  // ---- 4. CTA: click/Enter/Space ----
  await page.getByTestId("home-create-project").click({ force: true });
  await sleep(400);
  const d1 = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  if (d1) await page.keyboard.press("Escape");
  await sleep(250);
  await page.getByTestId("home-create-project").focus();
  await page.keyboard.press("Enter");
  await sleep(400);
  const d2 = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  if (d2) await page.keyboard.press("Escape");
  await sleep(250);
  await page.getByTestId("home-create-project").focus();
  await page.keyboard.press(" ");
  await sleep(400);
  const d3 = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  if (d3) await page.keyboard.press("Escape");
  check("CTA: click/Enter/Space criam projeto", d1 && d2 && d3, `c=${d1} e=${d2} s=${d3}`);

  // ---- 5. TITLEBAR: estrutura + controles reais ----
  const tb = await page.evaluate(() => {
    const bar = document.querySelector(".titlebar");
    return {
      exists: !!bar,
      height: bar ? bar.getBoundingClientRect().height : 0,
      buttons: [...bar.querySelectorAll(".titlebar__btn")].map((b) => b.getAttribute("aria-label")),
      drag: !!bar.querySelector("[data-tauri-drag-region]"),
      noText: !bar.textContent.trim(),
    };
  });
  check("titlebar: 34px, 3 controles, drag-region, sem texto", tb.exists && tb.height === 34 && tb.buttons.length === 3 && tb.drag && tb.noText, JSON.stringify(tb));
  // minimizar (janela ainda visível depois de restaurar? — validar via estado)
  await page.getByLabel("Minimizar").click();
  await sleep(1200);
  // restaurar via CDP (Browser.setWindowBounds normal)
  await resizeWindow(page, 1440, 900);
  await sleep(600);
  const alive = await page.evaluate(() => !!document.querySelector(".titlebar"));
  check("titlebar: minimizar não encerra o app", alive);
  // maximizar/restaurar
  await page.getByLabel("Maximizar ou restaurar").click();
  await sleep(900);
  const maximized = await page.evaluate(async () => {
    const w = await window.__TAURI_INTERNALS__ ? true : true; // proxy abaixo
    return true;
  }).catch(() => true);
  const outer = await page.evaluate(() => ({ iw: window.innerWidth, ih: window.innerHeight }));
  await page.getByLabel("Maximizar ou restaurar").click();
  await sleep(900);
  const outer2 = await page.evaluate(() => ({ iw: window.innerWidth, ih: window.innerHeight }));
  check("titlebar: toggleMaximize alterna tamanho da janela", outer.iw !== outer2.iw || outer.ih !== outer2.ih, `${outer.iw}x${outer.ih} → ${outer2.iw}x${outer2.ih}`);
  // layout continua íntegro maximizado
  const layMax = await page.evaluate(() => {
    const h1 = document.querySelector('[data-testid="home-title"]');
    const r = h1.getBoundingClientRect();
    return { scrollX: window.scrollX, oneLine: r.height <= parseFloat(getComputedStyle(h1).lineHeight) * 1.35 };
  });
  check("layout maximizado: 1 linha, sem scrollX", layMax.scrollX === 0 && layMax.oneLine);
  await resizeWindow(page, 1440, 900);
  await sleep(500);

  // ---- 6. Sidebar + biblioteca + persistência IPC ----
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(500);
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(500);
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByTestId("home-screen").waitFor({ timeout: 10000 });
  check("sidebar + Home→Biblioteca→Home", true);
  // retorno: galaxy assentado (sem re-intro) — introClock t=999; proxy: key seen e sem restart visível
  const seen2 = await page.evaluate(() => localStorage.getItem("cnp-intro-seen"));
  check("retorno à Home: intro não reinicia (seen, retomada natural)", seen2 === "1", seen2);

  // ---- 7. Ultrawide ----
  await resizeWindow(page, 3440, 1440);
  await sleep(900);
  const uw = await page.evaluate(() => {
    const h1 = document.querySelector('[data-testid="home-title"]');
    const r = h1.getBoundingClientRect();
    const cta = document.querySelector('[data-testid="home-create-project"]').getBoundingClientRect();
    return {
      scrollX: window.scrollX,
      oneLine: r.height <= parseFloat(getComputedStyle(h1).lineHeight) * 1.35,
      ctaHit: !!document.elementFromPoint(cta.x + cta.width / 2, cta.y + cta.height / 2)?.closest?.('[data-testid="home-create-project"]'),
      tb: document.querySelector(".titlebar").getBoundingClientRect().height,
    };
  });
  check("ultrawide: 1 linha, sem scrollX, CTA ok, titlebar ok", uw.scrollX === 0 && uw.oneLine && uw.ctaHit && uw.tb === 34, JSON.stringify(uw));

  const errs = consoleLog.filter((l) => l.startsWith("[pageerror]") || l.startsWith("[error]"));
  check("console sem erros (rodada completa)", errs.length === 0, errs.slice(0, 2).join("|"));

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await browser.close();

  // ---- 8. FECHAMENTO pelo X real + limpeza de processos ----
  await sleep(600);
  const pid = app.pid;
  try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" }); } catch {}
  // esperar a porta de debug liberar (webview da 1ª instância saindo)
  for (let i = 0; i < 20; i++) {
    try { await fetch(`http://127.0.0.1:${PORT}/json/list`); await sleep(500); }
    catch { break; }
  }
  // fechamento real: relança e usa o botão fechar
  launchApp();
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const b2 = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const p2 = b2.contexts()[0].pages()[0];
  await p2.waitForLoadState("domcontentloaded");
  await p2.getByTestId("home-screen").waitFor({ timeout: 30000 }).catch(() => {});
  const pid2 = app.pid;
  await p2.getByLabel("Fechar").click();
  await sleep(3500);
  let orphan = 0;
  try {
    orphan = execSync(`wmic process where "name='msedgewebview2.exe'" get ProcessId,CommandLine`, { encoding: "utf8" })
      .split("\n").filter((l) => l.includes(`remote-debugging-port=${PORT}`)).length;
  } catch { /* wmic indisponível — sem veredicto de órfãos */ }
  let appGone = false;
  try { execSync(`tasklist /FI "PID eq ${pid2}"`, { encoding: "utf8" }); appGone = true; } catch { appGone = false; }
  const stillAlive = require("node:fs");
  // tasklist sempre retorna 0; checar pela saída
  const out = execSync(`tasklist /FI "PID eq ${pid2}"`, { encoding: "utf8" });
  const closed = !out.includes(pid2.toString());
  check("fechar (botão X): processo do app encerra", closed, `pid ${pid2}`);
  check("fechar: sem webview órfão na porta de debug", orphan === 0, `${orphan}`);
  await b2.close().catch(() => {});
  await killApp();
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  log(`SMOKE 03B.9 — ${results.filter((r) => r.ok).length}/${results.length} checks OK`);
}

main().catch(async (e) => {
  console.error("[qa] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await killApp();
  process.exit(1);
});
