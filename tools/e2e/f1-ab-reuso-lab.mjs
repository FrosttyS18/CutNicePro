/** F1 A/B (goal-refino-editorial-fluxo-local) — ganho MEDIDO do reuso:
 * MESMA janela reservada inédita do goal pai (1476–1720? NÃO: o vídeo tem
 * 1476s; usamos 1000–1300 foi exposta… JANELA NOVA: 600–900, inédita p/
 * este goal), mesma transcrição real, mesmo pipeline (com borders).
 * Braço EXEC (default, recarga por chamada) × Braço SERVER (CNP_TEXT_SERVER=1,
 * reuso via llama-server sem mmproj). Mede tempo total, chamadas, RAM/VRAM.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9411;
const EXE = "C:/CutNicePro/app/src-tauri/target-refino/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-refino-editorial-fluxo-local-2026-10-24";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const WIN = { start: 600, end: 900 }; // inédita p/ este goal (600-900 nunca usada)
const log = (m) => console.log(`[f1] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = { window: WIN, arms: [] };

let app = null;
function launch(profile, textServer) {
  const wv = path.join(LAB, profile);
  fs.mkdirSync(wv, { recursive: true });
  const env = { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: wv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` };
  if (textServer) env.CNP_TEXT_SERVER = "1";
  app = spawn(EXE, [], { stdio: "ignore", env });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 12 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(2000);
}
const ram = () => { try {
  return Math.round(parseFloat(execSync(`powershell -NoProfile -Command "(Get-Process cutnicepro,msedgewebview2,llama-server,llama-completion -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1MB"`, { encoding: "utf8" }).trim()));
} catch { return -1; } };
const vram = () => { try {
  return parseInt(execSync("nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits", { encoding: "utf8" }).trim(), 10);
} catch { return -1; } };

async function runArm(label, textServer) {
  launch(`webview-f1-${label}`, textServer);
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));
  const invoke = (cmd, args) => page.evaluate(async ({ cmd, args }) => await window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });

  const project = await invoke("create_project", { name: `F1 ${label}` });
  await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(s => s.start >= WIN.start && s.end <= WIN.end);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "f1.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: MEDIA_ID, segments: record.segments });
  await sleep(1500);
  log(`braço ${label}${textServer ? " (CNP_TEXT_SERVER=1)" : ""}: ${record.segments.length} segs`);

  const ram0 = ram(), vram0 = vram();
  const t0 = Date.now();
  let job = null;
  const gen = invoke("generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(),
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  let ramPeak = ram0, vramPeak = vram0;
  for (;;) {
    await sleep(3000);
    ramPeak = Math.max(ramPeak, ram()); vramPeak = Math.max(vramPeak, vram());
    job = await invoke("clips_job", {}).catch(() => null);
    const done = await Promise.race([gen.then(v => ({ v })), sleep(0).then(() => null)]);
    if (done) { gen.result = done.v; break; }
    if ((job && job.state === "failed") || Date.now() - t0 > 25 * 60 * 1000) break;
  }
  let result; try { result = await gen; } catch (e) { result = { error: String(e) }; }
  const elapsedS = Math.round((Date.now() - t0) / 1000);
  const clipsFile = path.join(APPDATA, "clips", `${project.id}.json`);
  const collection = fs.existsSync(clipsFile) ? JSON.parse(fs.readFileSync(clipsFile, "utf8")) : null;
  const arm = {
    label, textServer, elapsedS, jobState: job?.state, jobError: job?.error ?? result?.error ?? null,
    backend: collection?.engine?.backend ?? null,
    clips: (collection?.clips ?? []).map(c => ({ start: +c.start.toFixed(1), end: +c.end.toFixed(1), score: c.score, title: c.title.slice(0, 60) })),
    ramPeakMB: ramPeak, ramBaseMB: ram0, vramPeakUsedMiB: vramPeak, vramBaseUsedMiB: vram0,
  };
  out.arms.push(arm);
  log(`${label}: ${elapsedS}s | ${(arm.clips.length)} cortes | backend ${arm.backend} | RAM pico ${ramPeak}MB | VRAM ${vramPeak}MiB | erro ${arm.jobError}`);
  await browser.close().catch(() => {});
  await killApp();
  await sleep(3000);
}

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  await runArm("exec", false);
  await runArm("server", true);
  fs.writeFileSync(path.join(EVIDENCE, "f1-ab-reuso.json"), JSON.stringify(out, null, 2));
  log("A/B salvo em f1-ab-reuso.json");
}
main().catch(async (e) => {
  console.error("[f1] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "f1-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
