/**
 * CutNicePro M1 — E2E do APLICATIVO DESKTOP REAL (Windows/WebView2).
 *
 * Estratégia: lança o cutnicepro.exe (build release) com
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port e conecta o
 * Playwright via CDP à janela real. Fluxo validado:
 *   1) primeira execução → estado vazio
 *   2) criar projeto → workspace vazio (AC-011)
 *   3) voltar → listagem
 *   4) FECHAR o aplicativo → RELANÇAR → projeto persistido (AC-013)
 *   5) abrir projeto → workspace
 * Screenshots + log de console em docs/reports/evidence/m1/.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9333;
const OUT = "C:/CutNicePro/docs/reports/evidence/m1";
const APPDATA = process.env.APPDATA;
const DATA_DIR = path.join(APPDATA, "com.cutnicepro.app", "cutnicepro");
const PROJECT_NAME = "Podcast Cortes — Ep. 12";

fs.mkdirSync(OUT, { recursive: true });
const consoleLog = [];

function log(msg) {
  console.log(`[e2e] ${msg}`);
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
      /* app ainda subindo */
    }
    await sleep(500);
  }
  throw new Error("CDP não ficou disponível");
}

function launchApp() {
  const child = spawn(EXE, [], {
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    },
  });
  log(`app lançado (pid ${child.pid})`);
  return child;
}

async function killApp(child) {
  if (!child || child.exitCode !== null) return;
  spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(1500);
  log("app encerrado");
}

async function getPage() {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const ctx = browser.contexts()[0];
  const pages = ctx.pages();
  const page =
    pages.find((p) => p.url().includes("index.html") || p.url().startsWith("http://localhost")) ??
    pages[0];
  await page.waitForLoadState("domcontentloaded");
  page.on("console", (m) => consoleLog.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));
  return { browser, page };
}

async function main() {
  // Estado limpo da PRÓPRIA app (dados só desta aplicação) para determinismo.
  fs.rmSync(path.join(APPDATA, "com.cutnicepro.app"), { recursive: true, force: true });
  log(`dados limpos: ${DATA_DIR}`);

  // ---- 1ª execução -----------------------------------------------------
  let app = launchApp();
  await waitForCdp();
  let { browser, page } = await getPage();

  await page.getByTestId("empty-state").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "01-empty-state.png") });
  log("estado vazio OK (AC-004)");

  await page.getByTestId("create-first-project").click();
  await page.getByTestId("project-name-input").fill(PROJECT_NAME);
  await page.getByTestId("confirm-create-project").click();
  await page.getByTestId("workspace-title").waitFor({ timeout: 15000 });
  const title = await page.getByTestId("workspace-title").textContent();
  if (title !== PROJECT_NAME) throw new Error(`título inesperado: ${title}`);
  await page.screenshot({ path: path.join(OUT, "02-workspace-criado.png") });
  log(`projeto criado e workspace aberto (AC-009/AC-011): "${title}"`);

  await page.getByRole("button", { name: "← Voltar" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "03-home-com-projeto.png") });
  log("listagem OK (AC-006)");

  // O arquivo de persistência precisa existir no disco ANTES de fechar.
  if (!fs.existsSync(path.join(DATA_DIR, "projects.json"))) {
    throw new Error("projects.json não encontrado no app-data");
  }
  await browser.close();

  // ---- FECHAR e RELANÇAR (prova de persistência AC-012/AC-013) ---------
  await killApp(app);
  app = launchApp();
  await waitForCdp();
  ({ browser, page } = await getPage());

  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  const cardName = await page
    .getByTestId("project-card")
    .getByRole("button", { name: "Abrir projeto" });
  if (!cardName) throw new Error("botão abrir ausente");
  await page.screenshot({ path: path.join(OUT, "04-apos-reinicio.png") });
  log("projeto PERSISTIDO após fechar e reabrir o aplicativo (AC-013)");

  await page.getByRole("button", { name: "Abrir projeto" }).click();
  await page.getByTestId("workspace-title").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "05-projeto-reaberto.png") });
  log("projeto reaberto (AC-007)");

  await browser.close();
  await killApp(app);

  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  const pageErrors = consoleLog.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
  if (pageErrors.length) {
    log(`AVISO: ${pageErrors.length} erro(s) de console/página registrados`);
  }
  log("E2E DESKTOP CONCLUÍDO COM SUCESSO");
}

main().catch((e) => {
  console.error("[e2e] FALHA:", e);
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  process.exit(1);
});
