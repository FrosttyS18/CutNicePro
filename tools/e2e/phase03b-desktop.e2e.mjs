/**
 * CutNicePro Fase 03B — E2E do APLICATIVO DESKTOP REAL (Windows/WebView2).
 *
 * Estratégia: lança o cutnicepro.exe (build release) com
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port e conecta o
 * Playwright via CDP à janela real. Fluxo validado (design 03B):
 *   1) boot → splash sai → Home (área artística + CTA)
 *   2) sidebar colapsada/expandida pelo logo do rail (preferência persistida)
 *   3) criar projeto pela Home → workspace (AC-011)
 *   4) voltar → Meus Projetos > Todos com card do projeto
 *   5) criar coleção → interior da coleção (breadcrumb 3 níveis)
 *   6) adicionar projeto à coleção (persistência aditiva)
 *   7) FECHAR o aplicativo → RELANÇAR → projetos E coleções persistidos
 *   8) abrir projeto → workspace
 *   9) responsividade 1280×720 / 1920×1080 / 1440×900 via CDP
 * Screenshots + log de console em docs/reports/evidence/03b/.
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
const OUT = "C:/CutNicePro/docs/reports/evidence/03b";
const APPDATA = process.env.APPDATA;
const DATA_DIR = path.join(APPDATA, "com.cutnicepro.app", "cutnicepro");
const PROJECT_NAME = "Podcast Cortes — Ep. 12";
const COLLECTION_NAME = "Mr beast";

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

/** Redimensiona a janela nativa via CDP (Browser.setWindowBounds). */
async function resizeWindow(page, width, height) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", {
      windowId,
      bounds: { left: 40, top: 40, width, height, windowState: "normal" },
    });
    await sleep(400);
    log(`janela redimensionada para ${width}×${height}`);
    return true;
  } catch (e) {
    log(`AVISO: não foi possível redimensionar via CDP (${e.message})`);
    return false;
  } finally {
    await cdp.detach();
  }
}

async function main() {
  // Estado limpo da PRÓPRIA app (dados só desta aplicação) para determinismo.
  fs.rmSync(path.join(APPDATA, "com.cutnicepro.app"), { recursive: true, force: true });
  log(`dados limpos: ${DATA_DIR}`);

  // ---- 1ª execução -----------------------------------------------------
  app = launchApp();
  await waitForCdp();
  let { browser, page } = await getPage();
  await resizeWindow(page, 1440, 900);

  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  await sleep(600); // splash fade + fontes/imagens assentarem
  // Normaliza o estado da sidebar (preferência pode sobreviver à limpeza de dados).
  const expandFirst = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expandFirst.count()) > 0) {
    await expandFirst.click();
    await sleep(450);
    log("sidebar normalizada para expandida");
  }
  await page.screenshot({ path: path.join(OUT, "01-home-expandida-1440.png") });
  log("Home expandida OK (tela 2)");

  // Sidebar: mesmo shell, estado colapsado (tela 3) e volta.
  await page.getByRole("button", { name: "Recolher barra lateral" }).click();
  await sleep(450);
  await page.screenshot({ path: path.join(OUT, "02-home-curta-1440.png") });
  log("Home curta OK (tela 3)");
  await page.getByRole("button", { name: "Expandir barra lateral" }).click();
  await sleep(450);

  // Criar projeto pela Home → workspace (AC-009/AC-011).
  await page.getByTestId("home-create-project").click();
  await page.getByTestId("project-name-input").fill(PROJECT_NAME);
  await page.getByTestId("confirm-create-project").click();
  await page.getByTestId("workspace-title").waitFor({ timeout: 15000 });
  const title = await page.getByTestId("workspace-title").textContent();
  if (title !== PROJECT_NAME) throw new Error(`título inesperado: ${title}`);
  await page.screenshot({ path: path.join(OUT, "03-workspace-1440.png") });
  log(`projeto criado e workspace aberto: "${title}"`);

  // Voltar → Meus Projetos > Todos (tela 4).
  await page.getByRole("button", { name: "← Voltar" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, "04-projetos-todos-1440.png") });
  log("Meus Projetos > Todos OK (tela 4)");

  // Coleções (tela 5) → criar → interior (tela 6).
  await page.getByRole("button", { name: "Coleções", exact: true }).click();
  await page.getByTestId("new-collection-card").waitFor({ timeout: 10000 });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, "05-projetos-colecoes-1440.png") });
  log("Meus Projetos > Coleções OK (tela 5)");

  await page.getByTestId("new-collection-card").click();
  await page.getByTestId("collection-name-input").fill(COLLECTION_NAME);
  await page.getByTestId("confirm-create-collection").click();
  await page.getByTestId("collection-title").waitFor({ timeout: 15000 });
  const colTitle = await page.getByTestId("collection-title").textContent();
  if (colTitle !== COLLECTION_NAME) throw new Error(`coleção inesperada: ${colTitle}`);
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, "06-colecao-pasta-1440.png") });
  log("interior da coleção OK (tela 6)");

  // Adicionar o projeto à coleção (persistência aditiva real).
  await page.getByTestId("add-project-to-collection").click();
  const checkbox = page.getByRole("checkbox").first();
  await checkbox.check();
  await page.getByTestId("confirm-add-projects").click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, "07-colecao-com-projeto-1440.png") });
  log("projeto adicionado à coleção");

  // Persistência no disco ANTES de fechar.
  for (const f of ["projects.json", "collections.json"]) {
    if (!fs.existsSync(path.join(DATA_DIR, f))) {
      throw new Error(`${f} não encontrado no app-data`);
    }
  }
  await browser.close();

  // ---- FECHAR e RELANÇAR (prova de persistência AC-012/AC-013) ---------
  await killApp();
  app = launchApp();
  await waitForCdp();
  ({ browser, page } = await getPage());
  await resizeWindow(page, 1440, 900);

  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  // Normaliza a sidebar também após o reinício (o teste não depende da
  // preferência salva; a persistência dela é validada à parte).
  const expandRestart = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expandRestart.count()) > 0) {
    await expandRestart.click();
    await sleep(450);
  }
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Coleções", exact: true }).click();
  await page.getByTestId("collection-card").waitFor({ timeout: 10000 });
  const cardText = await page.getByTestId("collection-card").textContent();
  if (!cardText.includes(COLLECTION_NAME)) throw new Error(`coleção não persistiu: ${cardText}`);
  if (!cardText.includes("1 projeto")) throw new Error(`contagem inesperada: ${cardText}`);
  await page.screenshot({ path: path.join(OUT, "08-apos-reinicio-colecoes-1440.png") });
  log("projetos E coleções PERSISTIDOS após fechar e reabrir o aplicativo");

  await page.getByTestId("collection-card").click();
  await page.getByTestId("project-card").waitFor({ timeout: 10000 });
  await page.getByTestId("project-card").click();
  await page.getByTestId("workspace-title").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(OUT, "09-projeto-reaberto-1440.png") });
  log("projeto reaberto a partir da coleção");

  // ---- responsividade ---------------------------------------------------
  await page.getByRole("button", { name: "← Voltar" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 10000 });

  await resizeWindow(page, 1280, 720);
  await sleep(400);
  await page.getByRole("button", { name: "Início", exact: true }).click();
  await page.getByTestId("home-screen").waitFor({ timeout: 10000 });
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, "10-home-1280x720.png") });
  log("Home em 1280×720 capturada");

  await resizeWindow(page, 1920, 1080);
  await sleep(400);
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").waitFor({ timeout: 10000 });
  await sleep(300);
  await page.screenshot({ path: path.join(OUT, "11-projetos-1920x1080.png") });
  log("Projetos em 1920×1080 capturado");

  await browser.close();
  await killApp();

  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  const pageErrors = consoleLog.filter((l) => l.startsWith("[error]") || l.startsWith("[pageerror]"));
  if (pageErrors.length) {
    log(`AVISO: ${pageErrors.length} erro(s) de console/página registrados`);
  }
  log("E2E 03B DESKTOP CONCLUÍDO COM SUCESSO");
}

main().catch(async (e) => {
  console.error("[e2e] FALHA:", e);
  await killApp();
  fs.writeFileSync(path.join(OUT, "console.log"), consoleLog.join("\n") || "(vazio)");
  process.exit(1);
});
