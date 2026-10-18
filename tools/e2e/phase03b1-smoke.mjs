/**
 * CutNicePro 03B.1 — SMOKE desktop (não destrutivo: NÃO limpa appdata).
 *
 * Valida as correções de fidelidade sem recriar dados:
 *   1) Home pós-correção (áreas de animação reservadas vazias)
 *   2) Toggle da sidebar pelo botão do panel-head (mouse)
 *   3) Teclado: foco visível + Enter alterna (aria-expanded real)
 *   4) Persistência da preferência entre reinícios do processo
 *   5) Navegação M1 preservada: projetos e coleções existentes visíveis
 * Screenshots em docs/reports/evidence/03b1/.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9337;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b1";
const consoleLog = [];

fs.mkdirSync(OUT, { recursive: true });

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

let app = null;

function launchApp() {
  app = spawn(EXE, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
  });
  log(`app lançado (pid ${app.pid})`);
  return app;
}

async function killApp() {
  if (!app || app.exitCode !== null) return;
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(1500);
  log("app encerrado");
}

async function waitForCdp(retries = 60) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        if (targets.some((t) => t.type === "page")) return true;
      }
    } catch {
      /* subindo */
    }
    await sleep(500);
  }
  throw new Error("CDP não ficou disponível");
}

async function getPage() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];
  const page =
    ctx.pages().find((p) => p.url().includes("index.html") || p.url().startsWith("http://localhost")) ??
    ctx.pages()[0];
  await page.waitForLoadState("domcontentloaded");
  page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));
  return { browser, page };
}

async function resizeWindow(page, width, height) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { left: 40, top: 40, width, height, windowState: "normal" },
    });
    await sleep(400);
  } finally {
    await cdp.detach();
  }
}

async function expandedState(page) {
  return page
    .locator(".panel-toggle")
    .getAttribute("aria-expanded")
    .then((v) => v === "true");
}

async function main() {
  app = launchApp();
  await waitForCdp();
  let { browser, page } = await getPage();
  await resizeWindow(page, 1440, 900);

  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, "01-home-03b1.png") });
  log("Home pós-03B.1 capturada");

  // Normaliza expandida (estado inicial conhecido).
  if (!(await expandedState(page))) {
    await page.getByRole("button", { name: "Expandir barra lateral" }).click();
    await sleep(450);
  }
  await page.screenshot({ path: path.join(OUT, "02-sidebar-expandida.png") });
  const rail = page.locator(".rail");
  await rail.screenshot({ path: path.join(OUT, "03-rail-icons.png") });
  log("sidebar expandida + rail (ícones) capturados");

  // Toggle por mouse: recolher.
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(450);
  if (await expandedState(page)) throw new Error("toggle por mouse não recolheu");
  await page.screenshot({ path: path.join(OUT, "04-sidebar-recolhida.png") });
  log("toggle por MOUSE: recolhida (aria-expanded=false)");

  // Teclado: foco visível + Enter expande.
  await page.focus(".panel-toggle");
  await sleep(250);
  await page.screenshot({ path: path.join(OUT, "05-toggle-focus-visible.png") });
  const focused = await page.evaluate(() => document.activeElement?.className);
  if (focused !== "panel-toggle") throw new Error("foco não chegou ao botão do toggle");
  await page.keyboard.press("Enter");
  await sleep(450);
  if (!(await expandedState(page))) throw new Error("Enter não expandiu a sidebar");
  await page.screenshot({ path: path.join(OUT, "06-pos-enter-expandida.png") });
  log("TECLADO: foco visível + Enter expandiu (aria-expanded=true)");

  // Space também alterna (volta a recolher).
  await page.focus(".panel-toggle");
  await page.keyboard.press("Space");
  await sleep(450);
  if (await expandedState(page)) throw new Error("Space não recolheu");
  log("TECLADO: Space recolheu");

  // Persistência da preferência entre reinícios (sem limpar dados).
  await browser.close();
  await killApp();
  app = launchApp();
  await waitForCdp();
  ({ browser, page } = await getPage());
  await resizeWindow(page, 1440, 900);
  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  await sleep(500);
  if (await expandedState(page)) throw new Error("preferência da sidebar não persistiu (esperava recolhida)");
  await page.screenshot({ path: path.join(OUT, "07-preferencia-persistida.png") });
  log("PREFERÊNCIA persistida após reinício do processo (recolhida)");

  // Navegação M1 preservada: projetos e coleções existentes.
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  const expandBtn = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expandBtn.count()) > 0) {
    await expandBtn.click();
    await sleep(400);
  }
  await page.screenshot({ path: path.join(OUT, "08-projetos-preservados.png") });
  await page.getByRole("button", { name: "Coleções", exact: true }).click();
  await page.getByTestId("collection-card").waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, "09-colecoes-preservadas.png") });
  log("NAVEGAÇÃO M1 preservada: projeto e coleção existentes visíveis");

  await browser.close();
  await killApp();
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  const errors = consoleLog.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
  if (errors.length) log(`AVISO: ${errors.length} erro(s) de console/página`);
  log("SMOKE 03B.1 CONCLUÍDO COM SUCESSO");
}

main().catch(async (e) => {
  console.error("[smoke] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  await killApp();
  process.exit(1);
});
