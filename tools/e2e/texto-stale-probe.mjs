/** Probe stale corrigido (gate F item 4): o teste anterior editou segmento
 * FORA de todas as janelas (invalidação granular correta = 0 stale). Aqui
 * edita um segmento DENTRO da janela do primeiro corte → espera stale>=1.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9400;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const PROJECT_ID = "1403fa35-a802-4e09-bf84-be5d5a943b39";
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const log = (m) => console.log(`[stale] ${m}`);

let app = null;
function launch() {
  const wv = path.join(LAB, "webview-stale");
  fs.mkdirSync(wv, { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: wv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1200);
}

async function main() {
  const clipsFile = path.join(APPDATA, "clips", `${PROJECT_ID}.json`);
  const collection = JSON.parse(fs.readFileSync(clipsFile, "utf8"));
  const first = collection.clips.filter(c => !c.deleted).sort((a, b) => a.start - b.start)[0];
  const transcriptsFile = path.join(APPDATA, "transcripts", `${PROJECT_ID}.json`);
  const record = JSON.parse(fs.readFileSync(transcriptsFile, "utf8"));
  const inside = record.segments.find(s => s.start >= first.start && s.end <= first.end);
  if (!inside) throw new Error("nenhum segmento dentro da janela do corte 1");
  inside.text = "CORREÇÃO DO USUÁRIO NO MEIO DO CORTE " + Math.random().toString(36).slice(2, 8);
  fs.writeFileSync(transcriptsFile, JSON.stringify(record));
  log(`editado segmento ${inside.start.toFixed(1)}-${inside.end.toFixed(1)}s dentro do corte ${first.start.toFixed(1)}-${first.end.toFixed(1)}s`);

  launch();
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));
  await page.evaluate(({ projectId, mediaId }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "s.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: PROJECT_ID, mediaId: MEDIA_ID });
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(1200);
  await page.getByRole("button", { name: "Meus Projetos" }).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(2000);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT GateF2" }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  const clips = await page.evaluate(async ({ projectId, mediaId }) => await window.__TAURI_INTERNALS__.invoke("get_clips", { projectId, mediaId }), { projectId: PROJECT_ID, mediaId: MEDIA_ID });
  const stale = clips.clips.filter(c => c.analysisStale).length;
  const result = { editedSegment: { start: inside.start, end: inside.end }, clipWindow: { start: first.start, end: first.end },
    total: clips.clips.length, staleMarked: stale };
  log(`stale marcados: ${stale}/${clips.clips.length}`);
  const existing = fs.existsSync(path.join(EVIDENCE, "gateF-ui.json"))
    ? JSON.parse(fs.readFileSync(path.join(EVIDENCE, "gateF-ui.json"), "utf8")) : {};
  existing.staleInsideClip = result;
  fs.writeFileSync(path.join(EVIDENCE, "gateF-ui.json"), JSON.stringify(existing, null, 2));
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[stale] ERRO:", e.message);
  await killApp();
  process.exit(1);
});
