/**
 * CutNicePro 03B.5 — Evidência VISUAL da interação do Hero Galaxy portado
 * (build final, sem sondas). 8 pontos do anel com hold longo antes do clique
 * (o lock congela o cartão sob o cursor → o clique acerta garantido quando
 * há cartão). Screenshots hold/clique para o VISION comprovar o boost.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9348;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b5/final";
fs.mkdirSync(OUT, { recursive: true });
function log(m) { console.log(`[ev] ${m}`); }

let app = null;
function launchApp() {
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  spawn("taskkill", ["/PID", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  await sleep(1500);
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
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.getByTestId("home-screen").waitFor({ timeout: 20000 });
  const expand = page.getByRole("button", { name: "Expandir barra lateral" });
  if ((await expand.count()) > 0) { await expand.click(); await sleep(400); }
  await sleep(3500);

  const box = await page.evaluate(() => {
    const r = document.querySelector(".home__galaxy").getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
  });
  const diag = Math.hypot(box.w, box.h) / 2;

  let n = 0;
  for (let k = 0; k < 8; k++) {
    const ang = k * Math.PI * 0.46 + 0.35;
    const rad = (k % 2 ? 0.62 : 0.82) * diag;
    const x = box.cx + Math.cos(ang) * rad;
    const y = box.cy - Math.sin(ang) * rad;
    if (x < 8 || y < 8 || x > 1432 || y > 892) continue;
    await page.mouse.move(x, y, { steps: 12 });
    await sleep(1100); // lock: targetTau + clear + congelamento
    await page.screenshot({ path: path.join(OUT, `q${n}-hold.png`) });
    await page.mouse.down(); await page.mouse.up();
    await sleep(450); // boostTau easing (~0.75)
    await page.screenshot({ path: path.join(OUT, `q${n}-clique.png`) });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, `q${n}-clique-tarde.png`) });
    await page.mouse.move(30, 865, { steps: 8 });
    await sleep(650); // retorno (boost decai ao sair)
    await page.screenshot({ path: path.join(OUT, `q${n}-fora.png`) });
    n++;
  }
  log(`${n} pontos; pageerrors ${errs.length}${errs.length ? ": " + errs[0] : ""}`);
  await browser.close();
  await killApp();
}

main().catch(async (e) => { console.error("[ev] FALHA:", e); await killApp(); process.exit(1); });
