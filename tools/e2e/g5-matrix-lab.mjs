/** G5 (goal-recuperacao-autoclip) — matriz controlada Gemma 12B × Qwen3-4B:
 * MESMA transcrição real (janela reservada NOVA p/ 4B: 1476-end, nunca
 * exposta — 1000-1300 foi a da rubrica 12B e 360-720 é calibração M3),
 * MESMOS options/templates do app, MESMO hardware. Mede tempo total,
 * chamadas (contagem scratch), RAM do grupo e VRAM por braço; rubrica
 * independente idêntica aplicada depois (fora do script).
 * Braços: quality "standard" (Qwen3-4B, caminho legado do app) ×
 * "experimentalGemma" (12B). Algoritmo = MESMO pipeline do app; só o
 * modelo muda → efeito modelo isolado do efeito algoritmo.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9405;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const WINDOW = { start: 1476, end: 1800 }; // trecho final ~24,6-30 min? vídeo=1476s → usa 1200-1476 (fim real)
const log = (m) => console.log(`[g5] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = { window: { start: 1200, end: 1476 }, arms: [] };

let app = null;
function launch(profile) {
  const wv = path.join(LAB, profile);
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
const groupRAM = () => { try {
  return Math.round(parseFloat(execSync(`powershell -NoProfile -Command "(Get-Process cutnicepro,msedgewebview2,llama-completion -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1MB"`, { encoding: "utf8" }).trim()));
} catch { return -1; } };
const vramUsed = () => { try {
  return parseInt(execSync("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits", { encoding: "utf8" }).trim(), 10);
} catch { return -1; } };

async function runArm(label, quality) {
  launch(`webview-g5-${label}`);
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));
  const invoke = (cmd, args) => page.evaluate(async ({ cmd, args }) => await window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });

  const project = await invoke("create_project", { name: `G5 ${label}` });
  await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(s => s.end > out.window.start && s.start < out.window.end);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "g5.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: MEDIA_ID, segments: record.segments });
  await sleep(1000); // SEM reload: navegação pela UI a partir da home
  log(`braço ${label} (${quality}): ${record.segments.length} segs na janela ${out.window.start}-${out.window.end}`);

  const ram0 = groupRAM(), vram0 = vramUsed();
  const scratchDir = path.join(APPDATA, "render-temp");
  const before = new Set(fs.readdirSync(scratchDir));
  const t0 = Date.now();
  let job = null, lastStage = "";
  const gen = invoke("generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(),
    options: { automatic: true, format: "9:16", fit: "cover", quality } }).catch(e => ({ error: String(e) }));
  for (;;) {
    await sleep(4000);
    job = await invoke("clips_job", {}).catch(() => null);
    if (job && job.stage !== lastStage) { lastStage = job.stage; log(`  ${label}: ${job.stage} ${job.progress}%`); }
    const done = await Promise.race([gen.then(v => ({ v })), sleep(0).then(() => null)]);
    if (done) { gen.result = done.v; break; }
    if ((job && job.state === "failed") || Date.now() - t0 > 35 * 60 * 1000) break;
  }
  let result; try { result = await gen; } catch (e) { result = { error: String(e) }; }
  const elapsedS = Math.round((Date.now() - t0) / 1000);
  const ramPeak = Math.max(groupRAM(), ram0);
  const vramPeak = Math.max(vramUsed(), vram0);

  const clipsFile = path.join(APPDATA, "clips", `${project.id}.json`);
  const collection = fs.existsSync(clipsFile) ? JSON.parse(fs.readFileSync(clipsFile, "utf8")) : null;
  const clips = collection?.clips ?? [];
  // métricas de chamadas do scratch NOVO deste braço
  const newDirs = fs.readdirSync(scratchDir).filter(d => !before.has(d));
  let calls = 0, kinds = {};
  for (const d of newDirs) {
    const dir = path.join(scratchDir, d);
    if (!fs.existsSync(dir)) continue;
    const results = fs.readdirSync(dir).filter(f => f.endsWith("-result.json"));
    calls += results.length;
    results.forEach(f => { const k = f.replace(/-\d+.*$/, "").replace("-result.json", ""); kinds[k] = (kinds[k] || 0) + 1; });
  }
  const arm = {
    label, quality, segments: record.segments.length, elapsedS,
    jobState: job?.state, jobError: job?.error ?? result?.error ?? null,
    backend: collection?.engine?.backend ?? null, model: collection?.engine?.model ?? null,
    clips: clips.map(c => ({ start: +c.start.toFixed(1), end: +c.end.toFixed(1), score: c.score, title: c.title,
      summary: (c.analysis?.summary ?? "").slice(0, 220), reasons: c.reasons,
      analysisError: c.analysisError ?? null })),
    calls: { total: calls, kinds }, ramPeakMB: ramPeak, ramBaseMB: ram0, vramPeakUsedMiB: vramPeak, vramBaseUsedMiB: vram0,
  };
  out.arms.push(arm);
  fs.writeFileSync(path.join(EVIDENCE, `g5-arm-${label}.json`), JSON.stringify(collection ?? { error: arm.jobError }, null, 2));
  log(`${label}: ${elapsedS}s | ${clips.length} cortes | ${calls} chamadas ${JSON.stringify(kinds)} | RAM pico ${ramPeak}MB | VRAM ${vramPeak}MiB | erro ${arm.jobError}`);
  await browser.close().catch(() => {});
  await killApp();
  await sleep(3000);
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  // qwen4b já concluído (93s/12 cortes) — só o gemma12b nesta retomada
  await runArm("gemma12b", "experimentalGemma");
  // transcrição da janela p/ rubrica independente
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  out.windowTranscript = record.segments
    .filter(s => s.end > out.window.start && s.start < out.window.end)
    .map(s => ({ start: +s.start.toFixed(1), end: +s.end.toFixed(1), text: s.text }));
  fs.writeFileSync(path.join(EVIDENCE, "g5-comparison.json"), JSON.stringify(out, null, 2));
  log("matriz salva em g5-comparison.json");
}
main().catch(async (e) => {
  console.error("[g5] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "g5-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
