/**
 * CutNicePro 03B.5 — Varredura de clique do Hero Galaxy portado.
 * 12 pontos do anel orbital (raios/ângulos variados): em cada ponto, hold
 * (lock) → screenshot → clique → capturas 80/400/900ms → afasta. Um dos
 * pontos deve acertar um cartão e produzir o boost (~1.8×) + punch.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9344;
const OUT = "C:/CutNicePro/docs/reports/evidence/03b5/sweep";

fs.mkdirSync(OUT, { recursive: true });
function log(m) { console.log(`[sweep] ${m}`); }

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
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (r.ok) { const t = await r.json(); if (t.some((x) => x.type === "page")) break; }
    } catch {}
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
  await sleep(3200);

  // Centro da área do galaxy (container), em coords da página.
  const box = await page.evaluate(() => {
    const r = document.querySelector(".home__galaxy").getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, h: r.height };
  });
  const diag = Math.hypot(box.w, box.h) / 2;

  // 12 pontos: 2 raios × 6 ângulos (golden offset para variar os braços).
  const pts = [];
  for (let k = 0; k < 12; k++) {
    const ang = (k * Math.PI * 2 * 0.618) % (Math.PI * 2);
    const rad = (k % 2 === 0 ? 0.55 : 0.78) * diag;
    pts.push({ x: Math.round(box.cx + Math.cos(ang) * rad), y: Math.round(box.cy - Math.sin(ang) * rad) });
  }
  log(`centro (${Math.round(box.cx)},${Math.round(box.cy)}), ${pts.length} pontos`);

  let n = 0;
  for (const p of pts) {
    if (p.x < 5 || p.y < 5 || p.x > 1435 || p.y > 895) continue;
    await page.mouse.move(p.x, p.y, { steps: 10 });
    await sleep(650); // lock (targetTau + clear óptico)
    await page.screenshot({ path: path.join(OUT, `p${n}-hold.png`) });
    await page.mouse.down(); await page.mouse.up();
    await sleep(80);
    await page.screenshot({ path: path.join(OUT, `p${n}-clique80.png`) });
    await sleep(320);
    await page.screenshot({ path: path.join(OUT, `p${n}-clique400.png`) });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `p${n}-clique900.png`) });
    await page.mouse.move(30, 870, { steps: 8 });
    await sleep(450);
    n++;
  }
  log(`${n} pontos varridos; pageerrors: ${errs.length}${errs.length ? " — " + errs[0] : ""}`);
  await browser.close();
  await killApp();
}

main().catch(async (e) => {
  console.error("[sweep] FALHA:", e);
  await killApp();
  process.exit(1);
});
