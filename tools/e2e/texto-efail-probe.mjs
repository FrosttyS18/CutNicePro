/** Gate F — item "falha do motor": CNP_ANALYSIS_HOME aponta para pasta
 * VAZIA → binário do motor ausente → generate_clips deve falhar com erro
 * limpo ANTES de abrir job, sem publicar nada e sem travar o app.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9403;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const log = (m) => console.log(`[efail] ${m}`);

let app = null;
function launch() {
  const wv = path.join(LAB, "webview-efail");
  const fakeAnalysis = path.join(LAB, "analysis-vazia");
  fs.mkdirSync(wv, { recursive: true });
  fs.mkdirSync(fakeAnalysis, { recursive: true }); // SEM bin/, SEM modelo
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: wv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}`,
    CNP_ANALYSIS_HOME: fakeAnalysis } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1200);
}

async function main() {
  launch();
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));
  const invoke = (cmd, args) => page.evaluate(async ({ cmd, args }) => await window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });

  const project = await invoke("create_project", { name: "TXT Efail" });
  await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(s => s.start >= 1000 && s.end <= 1300);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "e.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: MEDIA_ID, segments: record.segments });
  await page.reload(); await sleep(2500);

  const t0 = Date.now();
  let error = null;
  try {
    await invoke("generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(),
      options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } });
    error = null; // sucesso seria FALHA do teste
  } catch (e) { error = String(e); }
  const elapsedMs = Date.now() - t0;
  await sleep(1500);
  const job = await invoke("clips_job", {}).catch(() => null);
  const published = fs.existsSync(path.join(APPDATA, "clips", `${project.id}.json`));
  const engineProcs = (() => { try {
    return parseInt(execSync(`powershell -NoProfile -Command "(Get-Process llama-completion -ErrorAction SilentlyContinue | Measure-Object).Count"`, { encoding: "utf8" }).trim(), 10);
  } catch { return -1; } })();
  const result = { failedFast: Boolean(error), elapsedMs, error: (error ?? "").slice(0, 200),
    jobState: job?.state ?? "nenhum", publishedPartial: published, engineProcs, appAlive: app.exitCode === null };
  log(`falhou rápido=${result.failedFast} em ${elapsedMs}ms | erro: ${result.error.slice(0, 90)}`);
  log(`job=${result.jobState} | parcial publicado=${published} | motor=${engineProcs} | app vivo=${result.appAlive}`);

  const existing = fs.existsSync(path.join(EVIDENCE, "gateF-ui.json"))
    ? JSON.parse(fs.readFileSync(path.join(EVIDENCE, "gateF-ui.json"), "utf8")) : {};
  existing.engineFailure = result;
  fs.writeFileSync(path.join(EVIDENCE, "gateF-ui.json"), JSON.stringify(existing, null, 2));
  log("gravado em gateF-ui.json → engineFailure");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[efail] ERRO:", e.message);
  await killApp();
  process.exit(1);
});
