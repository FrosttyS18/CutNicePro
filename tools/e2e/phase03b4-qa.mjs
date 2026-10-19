/**
 * CutNicePro 03B.4 — QA FUNCIONAL E VISUAL (não destrutivo).
 *
 * 15 testes da missão + matriz de 6 resoluções com métricas:
 *   interação: movimento, hover (sem efeito visual — fiel à referência),
 *   clique/expand em cartão wide/vertical/quadrado, retorno por clique fora,
 *   clique fora da área artística, CTA, sidebar, resize contínuo, reabertura
 *   da Home, reduced-motion, fechamento por teclado (Escape + foco).
 *   halftone: largura da TINTA dos pontos (% da largura útil), margens,
 *   altura da região, interatividade (aqua).
 * Evidências em docs/reports/evidence/03b4/.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9341;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b4";
const RESOLUTIONS = [
  [1280, 720],
  [1440, 900],
  [1920, 1080],
  [2560, 1080],
  [3440, 1440],
  [3840, 1600],
];
const consoleLog = [];
const results = [];

fs.mkdirSync(OUT, { recursive: true });

function log(msg) {
  console.log(`[qa] ${msg}`);
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "OK " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`);
  if (!ok) process.exitCode = 1;
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

/** Estado dos cartões visíveis: proporção, transform, tamanho renderizado. */
function cardStates() {
  return [...document.querySelectorAll(".orbit__card")]
    .filter((el) => el.style.display !== "none")
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        ratio: Math.round((r.width / Math.max(1, r.height)) * 100) / 100,
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        w: Math.round(r.width),
        h: Math.round(r.height),
        z: el.style.zIndex,
        op: el.style.opacity,
        cursor: getComputedStyle(el).cursor,
      };
    });
}

/** Métricas do halftone: tinta dos pontos vs largura útil + interatividade. */
function halftoneMetrics() {
  const c = document.querySelector(".home-halftone canvas");
  if (!c) return null;
  const rect = c.getBoundingClientRect();
  const ctx = c.getContext("2d");
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let minX = 1e9, maxX = -1e9;
  for (let y = 0; y < c.height; y += 2) {
    for (let x = 0; x < c.width; x += Math.max(1, Math.floor(c.width / 600))) {
      if (d[(y * c.width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (minX > maxX) return { rect: { w: Math.round(rect.width), h: Math.round(rect.height) } };
  const dprX = c.width / rect.width;
  return {
    rect: { w: Math.round(rect.width), h: Math.round(rect.height) },
    inkWidthPct: Math.round(((maxX - minX) / dprX / rect.width) * 1000) / 10,
    marginsPx: { left: Math.round(minX / dprX), right: Math.round(rect.width - maxX / dprX) },
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

/** Encontra índice de um cartão visível por classe de proporção. */
async function findCard(page, kind) {
  return page.evaluate((k) => {
    const els = [...document.querySelectorAll(".orbit__card")].filter((el) => el.style.display !== "none");
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      const ratio = r.width / Math.max(1, r.height);
      if (k === "wide" && ratio > 1.4) return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      if (k === "vertical" && ratio < 0.75) return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      if (k === "square" && ratio >= 0.85 && ratio <= 1.15) return { i, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    }
    return null;
  }, kind);
}

async function scaleOf(page, idx) {
  return page.evaluate((i) => {
    const els = document.querySelectorAll(".orbit__card");
    const t = els[i]?.style.transform || "";
    const m = /scale\(([\d.]+)\)/.exec(t);
    return m ? parseFloat(m[1]) : -1;
  }, idx);
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
  const expand = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expand.count()) > 0) {
    await expand.click();
    await sleep(400);
  }
  await resizeWindow(page, 1440, 900);
  await sleep(700);

  // ---- 1. Movimento contínuo ----
  const mv1 = await page.evaluate(cardStates);
  await sleep(1200);
  const mv2 = await page.evaluate(cardStates);
  const moved = mv2.filter((c, i) => Math.abs(c.x - mv1[i].x) + Math.abs(c.y - mv1[i].y) > 3).length;
  check("1. movimento contínuo", moved > mv2.length * 0.7, `${moved}/${mv2.length} deslocados`);

  // ---- 2. Hover sem efeito visual (fiel à referência) + cursor pointer ----
  const hoverTarget = await findCard(page, "wide");
  check("2a. cartão wide encontrável", !!hoverTarget);
  if (hoverTarget) {
    await page.mouse.move(hoverTarget.x, hoverTarget.y, { steps: 8 });
    await sleep(500);
    const hovered = await page.evaluate(cardStates);
    const h = hovered[hoverTarget.i];
    const before = mv2[hoverTarget.i];
    const deltaHover = Math.abs(h.w - before.w);
    check("2b. hover: cursor de clique nos cartões", h.cursor === "pointer");
    check(
      "2c. hover: SEM efeito visual de escala (referência)",
      deltaHover < 6,
      `Δw ${deltaHover.toFixed(0)}px`,
    );
    await page.screenshot({ path: path.join(OUT, "hover-sem-efeito.png") });
  }

  // ---- 3+4. Clique em cartão WIDE: expande e retorna ----
  if (hoverTarget) {
    await page.evaluate((i) => document.querySelectorAll(".orbit__card")[i].click(), hoverTarget.i);
    await sleep(600);
    let sc = await scaleOf(page, hoverTarget.i);
    const base = mv2[hoverTarget.i] ? 0.55 : 0.6; // base ~0.55-1.0; expandido ~2.2x
    const expandedOk = sc > 1.1;
    check("3. clique wide: cartão expandido (~2.2×)", expandedOk, `scale ${sc.toFixed(2)}`);
    const others = await page.evaluate(cardStates);
    await sleep(700);
    const others2 = await page.evaluate(cardStates);
    const othersMoving = others2.filter((c, i) => i !== hoverTarget.i && Math.abs(c.x - others[i].x) > 1).length;
    check("3b. órbita dos demais continua durante expansão", othersMoving > 5, `${othersMoving} movendo`);
    await page.screenshot({ path: path.join(OUT, "expandido-wide.png") });
    // retorno por clique fora (dentro do painel, em área sem cartão)
    await page.mouse.click(720, 300);
    await sleep(700);
    sc = await scaleOf(page, hoverTarget.i);
    check("4. retorno por clique fora", sc < 1.1, `scale ${sc.toFixed(2)}`);
    await page.screenshot({ path: path.join(OUT, "retorno-wide.png") });
  }

  // ---- 5+7. Clique em VERTICAL e QUADRADO ----
  for (const kind of ["vertical", "square"]) {
    const t = await findCard(page, kind);
    if (!t) {
      check(`${kind}: cartão encontrável`, false);
      continue;
    }
    await page.evaluate((i) => document.querySelectorAll(".orbit__card")[i].click(), t.i);
    await sleep(600);
    const sc = await scaleOf(page, t.i);
    check(`${kind}: clique expande`, sc > 1.1, `scale ${sc.toFixed(2)}`);
    await page.screenshot({ path: path.join(OUT, `expandido-${kind}.png`) });
    await page.mouse.click(720, 300);
    await sleep(600);
    const sc2 = await scaleOf(page, t.i);
    check(`${kind}: retorno`, sc2 < 1.1, `scale ${sc2.toFixed(2)}`);
  }

  // ---- 9. Clique fora da área artística fecha ----
  const t9 = await findCard(page, "wide");
  if (t9) {
    await page.evaluate((i) => document.querySelectorAll(".orbit__card")[i].click(), t9.i);
    await sleep(500);
    await page.mouse.click(60, 640); // fora da área artística (rail)
    await sleep(600);
    const sc = await scaleOf(page, t9.i);
    check("9. clique fora da área artística fecha", sc < 1.1, `scale ${sc.toFixed(2)}`);
  }

  // ---- 10. CTA continua acessível (não vira expansão) ----
  const cta = page.getByTestId("home-create-project");
  const ctaVisible = await cta.isVisible().catch(() => false);
  check("10a. CTA visível", ctaVisible);
  if (ctaVisible) {
    await cta.click();
    await sleep(600);
    const dialog = await page.getByTestId("project-name-input").isVisible().catch(() => false);
    check("10b. clique no CTA abre o diálogo de projeto", dialog);
    if (dialog) await page.keyboard.press("Escape");
    await sleep(300);
  }

  // ---- 11. Sidebar expandida/recolhida ----
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(450);
  const collapsed = await page.locator(".side-panel--open").count() === 0;
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(450);
  const reopened = (await page.locator(".side-panel--open").count()) === 1;
  check("11. sidebar recolhe e expande", collapsed && reopened);

  // ---- 12. Redimensionamento contínuo ----
  for (const [w, h] of [[1600, 900], [1200, 760], [1800, 1000], [1440, 900]]) {
    await resizeWindow(page, w, h);
  }
  await sleep(400);
  const cardsAfter = await page.evaluate(cardStates);
  check("12. resize contínuo: cartões ativos preservados", cardsAfter.length >= 18, `${cardsAfter.length}`);

  // ---- 13. Reabertura da Home (navegação ida e volta) ----
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByTestId("home-screen").waitFor({ timeout: 10000 });
  const homeBack = await page.evaluate(cardStates);
  check("13. reabertura da Home", homeBack.length >= 18, `${homeBack.length} cartões`);
  await page.screenshot({ path: path.join(OUT, "home-completa-1440.png") });

  // ---- 14. Reduced-motion ----
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sleep(700);
  const rm1 = await page.evaluate(cardStates);
  await sleep(900);
  const rm2 = await page.evaluate(cardStates);
  const rmMoved = rm2.filter((c, i) => Math.abs(c.x - rm1[i].x) + Math.abs(c.y - rm1[i].y) > 2).length;
  check("14. reduced-motion: órbita estática", rmMoved === 0, `${rmMoved} movendo`);
  await page.screenshot({ path: path.join(OUT, "reduced-motion.png") });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await sleep(400);

  // ---- 15. Fechamento por teclado (Escape + foco retorna) ----
  const t15 = await findCard(page, "wide");
  if (t15) {
    await page.evaluate((i) => {
      document.querySelectorAll(".orbit__card")[i]?.focus();
    }, t15.i);
    await page.keyboard.press("Enter");
    await sleep(600);
    const sc = await scaleOf(page, t15.i);
    check("15a. Enter expande via teclado", sc > 1.1, `scale ${sc.toFixed(2)}`);
    await page.screenshot({ path: path.join(OUT, "expandido-teclado.png") });
    await page.keyboard.press("Escape");
    await sleep(600);
    const sc2 = await scaleOf(page, t15.i);
    const focusBack = await page.evaluate((i) => {
      const els = document.querySelectorAll(".orbit__card");
      return document.activeElement === els[i];
    }, t15.i);
    check("15b. Escape fecha e foco retorna ao cartão", sc2 < 1.1 && focusBack, `scale ${sc2.toFixed(2)}, foco=${focusBack}`);
  }

  // ---- Matriz de resoluções: composição + halftone full-bleed ----
  for (const [w, h] of RESOLUTIONS) {
    await resizeWindow(page, w, h);
    await sleep(500);
    const cards = await page.evaluate(cardStates);
    const hf = await page.evaluate(halftoneMetrics);
    const wide = cards.filter((c) => c.ratio > 1.4).length;
    const vert = cards.filter((c) => c.ratio < 0.75).length;
    const sq = cards.filter((c) => c.ratio >= 0.85 && c.ratio <= 1.15).length;
    log(
      `${w}x${h}: ${cards.length} cartões (w${wide}/v${vert}/q${sq}) | halftone ${hf?.rect.w}×${hf?.rect.h} | tinta ${hf?.inkWidthPct}% (margens ${hf?.marginsPx?.left}/${hf?.marginsPx?.right}px)`,
    );
    if (w === 1440 || w === 3440 || w === 1280) {
      await page.screenshot({ path: path.join(OUT, `home-${w}x${h}.png`) });
    }
  }
  const hf1440 = await page.evaluate(halftoneMetrics);
  check("halftone full-bleed: tinta ≥ 96% da largura útil", (hf1440?.inkWidthPct ?? 0) >= 96, `${hf1440?.inkWidthPct}%`);

  // ---- Halftone: interatividade preservada ----
  await resizeWindow(page, 1440, 900);
  await sleep(400);
  const box = await page.evaluate(() => {
    const r = document.querySelector(".home-halftone").getBoundingClientRect();
    return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.35 };
  });
  const rest = await page.evaluate(aquaPixels);
  await page.mouse.move(box.x, box.y, { steps: 10 });
  await sleep(350);
  const hoverAqua = await page.evaluate(aquaPixels);
  await page.mouse.down(); await page.mouse.up();
  await sleep(120);
  const clickAqua = await page.evaluate(aquaPixels);
  await page.mouse.move(30, 30, { steps: 5 });
  await sleep(1000);
  const backAqua = await page.evaluate(aquaPixels);
  check(
    "halftone: ponteiro/clique/retorno preservados",
    hoverAqua > rest && clickAqua > hoverAqua && backAqua <= hoverAqua,
    `aqua ${rest}→${hoverAqua}→${clickAqua}→${backAqua}`,
  );

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await browser.close();
  await killApp();
  log(`QA 03B.4 ENCERRADO — ${results.filter((r) => r.ok).length}/${results.length} checks OK`);
}

main().catch(async (e) => {
  console.error("[qa] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await killApp();
  process.exit(1);
});
