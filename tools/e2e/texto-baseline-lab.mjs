/** BASELINE TEXTUAL INTEGRAL (F2, goal-cortes-texto) — geração REAL por
 * texto no vídeo de 24,6 min (568 segs REAIS, transcrição pronta), caminho
 * exe padrão (llama-completion, SEM multimodal — CNP_ENABLE_MULTIMODAL
 * ausente), com amostragem de RAM/VRAM e métricas por chamada do scratch.
 * Projeto de trabalho próprio; dados do mantenedor somente leitura.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9392;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const PROJECT = "TXT Baseline";
const TIMEOUT_MS = 60 * 60 * 1000;
const log = (m) => console.log(`[txt] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = { samples: [], meta: {} };

let app = null;
function launch() {
  const wv = path.join(LAB, "webview-txt");
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
  await sleep(1500);
}
function groupRAM() {
  try {
    const v = execSync(`powershell -NoProfile -Command "(Get-Process cutnicepro,msedgewebview2,llama-completion -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1MB"`, { encoding: "utf8" });
    return Math.round(parseFloat(v.trim()));
  } catch { return -1; }
}
function vramFreeMiB() {
  try {
    const v = execSync("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits", { encoding: "utf8" });
    return parseInt(v.trim(), 10);
  } catch { return -1; }
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

  const project = await invoke("create_project", { name: PROJECT });
  const raw = await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const imported = typeof raw === "string" ? JSON.parse(raw) : raw;
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, analysis, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0"); // opt-in explícito: baseline é manual
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "baseline.mp4", videoId: null, url: null,
        width: analysis?.width ?? null, height: analysis?.height ?? null,
        duration: analysis?.durationMs ? analysis.durationMs / 1000 : null, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1,
        muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: imported.mediaId, analysis: imported.analysis, segments: record.segments });
  log(`projeto ${project.id} | mídia ${imported.mediaId} | 568 segs REAIS | autoGenerate=0`);

  const t0 = Date.now();
  const generation = invoke("generate_clips", {
    projectId: project.id, mediaId: imported.mediaId, jobId: crypto.randomUUID(),
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" },
  });
  let job = null, lastStage = "";
  const vram0 = vramFreeMiB();
  while (Date.now() - t0 < TIMEOUT_MS) {
    await sleep(15000);
    job = await invoke("clips_job", {}).catch(() => null);
    if (job && job.stage !== lastStage) { lastStage = job.stage; log(`job ${job.stage} ${job.progress}%`); }
    out.samples.push({ t: Math.round((Date.now() - t0) / 1000), ramMB: groupRAM() });
    const done = await Promise.race([generation.then(v => ({ v })), sleep(0).then(() => null)]);
    if (done) { generation.result = done.v; break; }
    if (job && job.state === "failed") break;
  }
  let result; try { result = await generation; } catch (e) { result = { error: String(e) }; }
  const elapsedS = Math.round((Date.now() - t0) / 1000);
  out.meta = {
    elapsedS, jobError: job?.error ?? result?.error ?? null, jobState: job?.state,
    vramBaseUsedMiB: vram0, vramPeakUsedMiB: vramFreeMiB(),
    ramPeakMB: Math.max(...out.samples.map(s => s.ramMB)),
  };
  log(`geração: ${elapsedS}s | estado ${job?.state} | erro: ${out.meta.jobError}`);

  // coleção + métricas por chamada do scratch
  const clipsFile = path.join(APPDATA, "clips", `${project.id}.json`);
  const collection = fs.existsSync(clipsFile) ? JSON.parse(fs.readFileSync(clipsFile, "utf8")) : null;
  const clips = collection?.clips ?? [];
  out.meta.backend = collection?.engine?.backend ?? null;
  out.meta.clips = clips.length;
  out.meta.clipsDetail = clips.map(c => ({ start: +c.start.toFixed(1), end: +c.end.toFixed(1), score: c.score, title: c.title.slice(0, 60), multimodal: Boolean(c.multimodal) }));
  // scratch mais recente
  const dirs = fs.readdirSync(path.join(APPDATA, "render-temp")).map(d => path.join(APPDATA, "render-temp", d));
  const newest = dirs.filter(fs.existsSync).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  if (newest) {
    const files = fs.readdirSync(newest);
    const calls = files.filter(f => f.endsWith("-result.json")).map(f => {
      const full = path.join(newest, f);
      return { stem: f.replace("-result.json", ""), bytes: fs.statSync(full).size, mtime: fs.statSync(full).mtime.toISOString() };
    }).sort((a, b) => a.mtime.localeCompare(b.mtime));
    out.meta.calls = calls;
    out.meta.callCount = calls.length;
    out.meta.scratch = newest;
    log(`chamadas ao motor: ${calls.length} (${[...new Set(calls.map(c => c.stem.replace(/-\d+$/, "")))].join(", ")})`);
  }
  log(`cortes: ${clips.length} | backend ${out.meta.backend} | multimodal em algum: ${clips.some(c => c.multimodal)}`);
  fs.writeFileSync(path.join(EVIDENCE, "baseline-textual-result.json"), JSON.stringify(out, null, 2));
  if (collection) fs.writeFileSync(path.join(EVIDENCE, "baseline-textual-collection.json"), JSON.stringify(collection, null, 2));
  log(`evidência em baseline-textual-result.json`);
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[txt] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "baseline-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
