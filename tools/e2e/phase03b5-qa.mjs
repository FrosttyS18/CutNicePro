/**
 * CutNicePro 03B.5 — QA do port do Hero Galaxy (não destrutivo).
 *
 * Fase A: validação técnica no app Windows real — canvas WebGL vivo, ausência
 * de erros, FPS por rAF, CTA/halftone/sidebar/navegação/resoluções + captura
 * de repouso (para o VISION apontar cartões) e sequência temporal de frames.
 * Evidências em docs/reports/evidence/03b5/.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9342;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b5";
const consoleLog = [];
const results = [];

fs.mkdirSync(OUT, { recursive: true });

function log(msg) {
  console.log(`[qa] ${msg}`);
}
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "OK " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`);
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
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { left: 20, top: 20, width, height, windowState: "normal" } });
    await sleep(350);
  } finally {
    await cdp.detach();
  }
}

async function main() {
  launchApp();
  await waitForCdp();
  const { browser, page } = await getPage();
  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  const expand = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expand.count()) > 0) {
    await expand.click();
    await sleep(400);
  }
  await resizeWindow(page, 1440, 900);

  // Intro: primeira visita roda a coreografia completa (cardsAt≈1s+rollout).
  await sleep(4500);

  // 1. Canvas WebGL vivo
  const gl = await page.evaluate(() => {
    const c = document.querySelector(".home__galaxy canvas");
    if (!c) return null;
    return {
      w: c.width,
      h: c.height,
      ctx: !!(c.getContext("webgl2") || c.getContext("webgl")),
    };
  });
  check("canvas WebGL presente com contexto", !!gl && gl.ctx, JSON.stringify(gl));

  // 2. FPS por rAF (60 amostras)
  const fps = await page.evaluate(async () => {
    return new Promise((resolve) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (n < 90) requestAnimationFrame(tick);
        else resolve(1000 / ((performance.now() - t0) / 90));
      };
      requestAnimationFrame(tick);
    });
  });
  check("FPS do hero sustentado (>=45)", fps >= 45, `${fps.toFixed(1)} fps`);

  // 3. Console sem erros de página
  const errors = consoleLog.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
  check("console sem erros de página/WebGL", errors.length === 0, errors.slice(0, 2).join(" | "));

  // 4. CTA funcional (não bloqueado pelo canvas)
  await page.getByTestId("home-create-project").click();
  await sleep(500);
  const dialog = await page.getByTestId("project-name-input").isVisible().catch(() => false);
  check("CTA abre diálogo de projeto", dialog);
  if (dialog) await page.keyboard.press("Escape");
  await sleep(300);

  // 5. Halftone intacto (tinta full-bleed + interatividade rápida)
  const hf = await page.evaluate(() => {
    const c = document.querySelector(".home-halftone canvas");
    if (!c) return null;
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
    const dprX = c.width / c.getBoundingClientRect().width;
    return { inkPct: Math.round(((maxX - minX) / dprX / c.getBoundingClientRect().width) * 1000) / 10 };
  });
  check("halftone intacto (tinta >=96%)", (hf?.inkPct ?? 0) >= 96, `${hf?.inkPct}%`);

  // 6. Sidebar + navegação preservadas
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(450);
  const collapsed = (await page.locator(".side-panel--open").count()) === 0;
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(450);
  const reopened = (await page.locator(".side-panel--open").count()) === 1;
  check("sidebar recolhe/expande", collapsed && reopened);
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByTestId("home-screen").waitFor({ timeout: 10000 });
  check("navegação M1 preservada (ida e volta)", true);
  await sleep(1500); // retorno do galaxy

  // 7. Capturas: repouso (para VISION apontar cartões) + sequência temporal
  await page.screenshot({ path: path.join(OUT, "galaxy-repouso-1440.png") });
  for (let i = 0; i < 8; i++) {
    await page.screenshot({ path: path.join(OUT, `galaxy-t${i}.png`) });
    await sleep(160);
  }
  log("sequência temporal de 8 frames (~160ms) capturada");

  // 8. Matriz de resoluções
  for (const [w, h] of [[1280, 720], [1920, 1080], [2560, 1080], [3440, 1440]]) {
    await resizeWindow(page, w, h);
    await sleep(900);
    const glR = await page.evaluate(() => {
      const c = document.querySelector(".home__galaxy canvas");
      return c ? { w: c.clientWidth, h: c.clientHeight } : null;
    });
    const errNow = consoleLog.filter((l) => l.startsWith("[pageerror]")).length;
    await page.screenshot({ path: path.join(OUT, `home-${w}x${h}.png`) });
    log(`${w}x${h}: canvas ${glR?.w}x${glR?.h}, pageerrors ${errNow}`);
    check(`resolução ${w}x${h} sem erros de página`, errNow === 0);
  }
  await resizeWindow(page, 1440, 900);
  await sleep(800);

  // 9. Sidebar recolhida (composição com painel largo)
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, "home-recolhida-1440.png") });
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(900);

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await browser.close();
  await killApp();
  log(`FASE A ENCERRADA — ${results.filter((r) => r.ok).length}/${results.length} checks OK`);
}

main().catch(async (e) => {
  console.error("[qa] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await killApp();
  process.exit(1);
});
