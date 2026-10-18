/**
 * CutNicePro 03B.2 — SMOKE comportamental (não destrutivo).
 *
 * Prova os dois motores da Home no aplicativo Windows real:
 *   HERO  : posições dos cartões mudam ao longo do tempo (transforms DOM).
 *   HALF  : repouso → ponteiro (pontos deslocam + Deep Aqua) → clique (onda
 *           radial) → retorno ao repouso; contagem de pixels aqua do canvas.
 *   APP   : CTA não bloqueado pelo hero; sidebar; navegação M1 preservada.
 * Evidências em docs/reports/evidence/03b2/.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9339;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b2";
const consoleLog = [];

fs.mkdirSync(OUT, { recursive: true });

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

let app = null;

function launchApp() {
  app = spawn(EXE, [], {
    stdio: "ignore",
    env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` },
  });
  log(`app lançado (pid ${app.pid})`);
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

async function getPage() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForLoadState("domcontentloaded");
  page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));
  return { browser, page };
}

async function resizeWindow(page, width, height) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left: 40, top: 40, width, height, windowState: "normal" } });
    await sleep(400);
  } finally {
    await cdp.detach();
  }
}

/** Amostra os transforms dos cartões do hero. */
function heroTransforms() {
  return [...document.querySelectorAll(".orbit__card")].slice(0, 10).map((e) => e.style.transform);
}

/** Conta pixels "aqua" (g e b altos, r baixo) no canvas do halftone. */
function aquaPixels() {
  const c = document.querySelector(".home-halftone canvas");
  if (!c) return -1;
  const ctx = c.getContext("2d");
  if (!ctx) return -1;
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
  const { browser, page } = await getPage();
  await resizeWindow(page, 1440, 900);
  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  await sleep(800); // fontes + primeiros frames

  // ---- HERO: movimento contínuo -----------------------------------------
  const t0 = await page.evaluate(heroTransforms);
  await page.screenshot({ path: path.join(OUT, "hero-t0.png") });
  await sleep(2000);
  const t2 = await page.evaluate(heroTransforms);
  await page.screenshot({ path: path.join(OUT, "hero-t2s.png") });
  await sleep(3000);
  const t5 = await page.evaluate(heroTransforms);
  await page.screenshot({ path: path.join(OUT, "hero-t5s.png") });
  const moved02 = t0.filter((v, i) => v !== t2[i]).length;
  const moved25 = t2.filter((v, i) => v !== t5[i]).length;
  if (moved02 < 8 || moved25 < 8) throw new Error(`hero sem movimento contínuo: ${moved02}/${moved25}`);
  log(`HERO: cartões em movimento (t0→2s: ${moved02}/10, t2→5s: ${moved25}/10)`);

  // ---- CTA não bloqueado pelo hero --------------------------------------
  const ctaHit = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="home-create-project"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === b;
  });
  if (ctaHit !== true) throw new Error("CTA bloqueado pelo hero");
  log("CTA clicável (hero não intercepta o ponteiro)");

  // ---- HALFTONE: repouso → ponteiro → clique → retorno -------------------
  const box = await page.evaluate(() => {
    const el = document.querySelector(".home-halftone");
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.35 };
  });

  const rest = await page.evaluate(aquaPixels);
  await page.screenshot({ path: path.join(OUT, "halftone-repouso.png") });
  if (rest < 0) throw new Error("canvas do halftone não encontrado");

  // Ponteiro parado sobre os pontos (varredura lenta para empurrar).
  await page.mouse.move(box.x - 60, box.y, { steps: 8 });
  await page.mouse.move(box.x, box.y, { steps: 12 });
  await sleep(350);
  const withPointer = await page.evaluate(aquaPixels);
  await page.screenshot({ path: path.join(OUT, "halftone-ponteiro.png") });
  if (withPointer <= rest) throw new Error(`ponteiro não aqueceu pontos (aqua ${rest}→${withPointer})`);
  log(`HALFTONE ponteiro: pixels aqua ${rest} → ${withPointer} (Deep Aqua na interação)`);

  // Clique: onda radial.
  await page.mouse.down();
  await page.mouse.up();
  await sleep(120);
  const clickPeak = await page.evaluate(aquaPixels);
  await page.screenshot({ path: path.join(OUT, "halftone-clique.png") });
  if (clickPeak <= rest) throw new Error(`clique não produziu onda (aqua ${rest}→${clickPeak})`);
  log(`HALFTONE clique: pico aqua ${clickPeak} (onda radial)`);

  // Retorno ao repouso.
  await page.mouse.move(40, 40, { steps: 6 });
  await sleep(1200);
  const back = await page.evaluate(aquaPixels);
  await page.screenshot({ path: path.join(OUT, "halftone-retorno.png") });
  if (back >= withPointer) throw new Error(`pontos não retornaram (aqua ${back})`);
  log(`HALFTONE retorno: aqua ${withPointer} → ${back} (molas devolvem os pontos)`);

  // ---- APP: integração geral ---------------------------------------------
  await page.screenshot({ path: path.join(OUT, "home-completa-1440.png") });
  log("Home completa capturada (hero + conteúdo + halftone)");

  // Normaliza o estado da sidebar antes de testar o recolhimento.
  const expandBtn = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expandBtn.count()) > 0) {
    await expandBtn.click();
    await sleep(450);
  }
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(450);
  await page.screenshot({ path: path.join(OUT, "home-recolhida.png") });
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(450);

  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "biblioteca-preservada.png") });
  log("navegação M1 preservada (biblioteca com dados existentes)");

  await browser.close();
  await killApp();
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  const errors = consoleLog.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
  if (errors.length) log(`AVISO: ${errors.length} erro(s) de console/página`);
  log("SMOKE 03B.2 CONCLUÍDO COM SUCESSO");
}

main().catch(async (e) => {
  console.error("[smoke] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await killApp();
  process.exit(1);
});
