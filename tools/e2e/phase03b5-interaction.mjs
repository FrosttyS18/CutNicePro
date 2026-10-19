/**
 * CutNicePro 03B.5 — QA de INTERAÇÃO do Hero Galaxy portado (não destrutivo).
 * Coordenadas fornecidas pelo VISION sobre o screenshot de repouso.
 * Hover: hold-brake (desaceleração) + lock óptico. Clique: boost + punch.
 * Retorno: sair do cartão cancela o boost (comportamento original).
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9343;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b5";
const consoleLog = [];
const results = [];

fs.mkdirSync(OUT, { recursive: true });
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
async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const t = await res.json();
        if (t.some((x) => x.type === "page")) return;
      }
    } catch {}
    await sleep(500);
  }
  throw new Error("CDP indisponível");
}

async function main() {
  launchApp();
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForLoadState("domcontentloaded");
  page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));
  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  const expand = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expand.count()) > 0) { await expand.click(); await sleep(400); }
  // Intro de retorno (localStorage seen) é curta; margem para o roll-out.
  await sleep(3000);

  // ---- HOVER: deriva com vs sem cursor sobre o cartão da DIREITA ----
  const target = { x: 1196, y: 385 };
  await page.mouse.move(30, 870, { steps: 4 });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, "hover-A0.png") });
  await sleep(420);
  await page.screenshot({ path: path.join(OUT, "hover-A1.png") }); // sem hover

  await page.mouse.move(target.x, target.y, { steps: 14 });
  await sleep(700);
  await page.screenshot({ path: path.join(OUT, "hover-B0.png") });
  await sleep(420);
  await page.screenshot({ path: path.join(OUT, "hover-B1.png") }); // com hover (hold)
  await sleep(500);
  await page.screenshot({ path: path.join(OUT, "hover-lock.png") });
  log("pares hover A/B + lock capturados");

  // ---- CLIQUE no cartão da direita: boost + punch ----
  await page.mouse.down(); await page.mouse.up();
  await sleep(120);
  await page.screenshot({ path: path.join(OUT, "clique-120ms.png") });
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, "clique-720ms.png") });
  log("clique capturado");

  // ---- RETORNO: mover para fora cancela o boost ----
  await page.mouse.move(60, 850, { steps: 12 });
  await sleep(800);
  await page.screenshot({ path: path.join(OUT, "retorno-fora.png") });
  log("retorno capturado");

  // ---- Segundo alvo (vertical, esquerda) e terceiro (topo) ----
  for (const [name, pt] of [["esq", { x: 653, y: 508 }], ["topo", { x: 952, y: 236 }]]) {
    await page.mouse.move(pt.x, pt.y, { steps: 12 });
    await sleep(600);
    await page.screenshot({ path: path.join(OUT, `hover-${name}.png`) });
    await page.mouse.down(); await page.mouse.up();
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, `clique-${name}.png`) });
    await page.mouse.move(60, 850, { steps: 10 });
    await sleep(700);
  }
  log("cliques em vertical (esq) e topo capturados");

  const errs = consoleLog.filter((l) => l.startsWith("[pageerror]"));
  check("interação sem erros de página", errs.length === 0, errs.slice(0, 2).join("|"));

  fs.writeFileSync(path.join(OUT, "results-interaction.json"), JSON.stringify(results, null, 1));
  fs.writeFileSync(path.join(OUT, "console-interaction.log"), consoleLog.join("\n") || "(vazio)");
  await browser.close();
  await killApp();
  log("QA INTERAÇÃO ENCERRADO");
}

main().catch(async (e) => {
  console.error("[qa] FALHA:", e);
  await killApp();
  process.exit(1);
});
