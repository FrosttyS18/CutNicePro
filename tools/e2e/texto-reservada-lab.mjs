/** F4 (goal-cortes-texto) — geração textual NA AMOSTRA RESERVADA
 * (1000–1300 s + contexto 880–1420, ~150 segs REAIS): mesma engine textual,
 * mesma mídia; saída avaliada pela rubrica INDEPENDENTE (fora deste script).
 * Em paralelo (instância separada), o gate E mede scrub durante esta
 * geração — ver texto-gatee-lab.mjs.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9393;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const RESERVED = { start: 1000, end: 1300, context: 880 };
const PROJECT = "TXT Reservada";
const log = (m) => console.log(`[reserv] ${new Date().toISOString().slice(11, 19)} ${m}`);

let app = null;
function launch() {
  const wv = path.join(LAB, "webview-reserv");
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
  record.segments = record.segments.filter(s => s.end > RESERVED.context && s.start < RESERVED.end + (RESERVED.end - RESERVED.context));
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, analysis, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "reserv.mp4", videoId: null, url: null,
        width: analysis?.width ?? null, height: analysis?.height ?? null,
        duration: analysis?.durationMs ? analysis.durationMs / 1000 : null, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1,
        muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: imported.mediaId, analysis: imported.analysis, segments: record.segments });
  log(`projeto ${project.id} | amostra reservada ${RESERVED.start}-${RESERVED.end}s | ${record.segments.length} segs`);

  const t0 = Date.now();
  const generation = invoke("generate_clips", {
    projectId: project.id, mediaId: imported.mediaId, jobId: crypto.randomUUID(),
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" },
  });
  let job = null;
  for (;;) {
    await sleep(5000);
    job = await invoke("clips_job", {}).catch(() => null);
    const done = await Promise.race([generation.then(v => ({ v })), sleep(0).then(() => null)]);
    if (done) { generation.result = done.v; break; }
    if ((job && job.state === "failed") || Date.now() - t0 > 30 * 60 * 1000) break;
  }
  let result; try { result = await generation; } catch (e) { result = { error: String(e) }; }
  const elapsedS = Math.round((Date.now() - t0) / 1000);
  const clipsFile = path.join(APPDATA, "clips", `${project.id}.json`);
  const collection = fs.existsSync(clipsFile) ? JSON.parse(fs.readFileSync(clipsFile, "utf8")) : null;
  const clips = collection?.clips ?? [];
  log(`${elapsedS}s | estado ${job?.state} | erro ${job?.error ?? result?.error ?? null}`);
  log(`cortes: ${clips.length} | backend ${collection?.engine?.backend} | multimodal: ${clips.some(c => c.multimodal)}`);
  const out = {
    reserved: RESERVED, segments: record.segments.length, elapsedS,
    jobError: job?.error ?? result?.error ?? null, backend: collection?.engine?.backend ?? null,
    clips: clips.map(c => ({
      start: +c.start.toFixed(1), end: +c.end.toFixed(1), score: c.score,
      title: c.title, summary: c.analysis?.summary ?? null, reasons: c.reasons,
      criteria: c.analysis?.criteria ?? null, review: c.review,
    })),
    // transcrição da janela para a rubrica independente (ground truth)
    windowTranscript: record.segments.map(s => ({ start: +s.start.toFixed(1), end: +s.end.toFixed(1), text: s.text })),
  };
  fs.writeFileSync(path.join(EVIDENCE, "reservada-resultado.json"), JSON.stringify(out, null, 2));
  log("evidência em reservada-resultado.json");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[reserv] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "reserv-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
