/** MARCO 3 — comparação delimitada no app REAL (goal-cortes-multimodais).
 * Braço A: experimentalGemma TEXTUAL (CNP_DISABLE_MULTIMODAL=1).
 * Braço B: experimentalGemma MULTIMODAL (server+mmproj, evidências reais).
 * Mesma mídia (24,6 min, dedupe), MESMA transcrição REAL (568 segs,
 * cópia somente leitura), mesmas opções/seed. Amostra EDITORIAL RESERVADA
 * declarada ANTES da execução: janela 360–720 s (min 6–12). Avaliação de
 * saída foca essa janela.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const PORT = 9387;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json";
const APPDATA = "C:/Users/addda/AppData/Roaming/com.cutnicepro.app/cutnicepro".replace("addda","adcka");
const RESERVED = { start: 360, end: 720 }; // declarada ANTES da execução
const TIMEOUT_MS = 40 * 60 * 1000;

const log = (m) => console.log(`[m3] ${m}`);
const out = { reserved: RESERVED, arms: [] };

let app = null;
function launchApp(disableMultimodal) {
  const webviewData = path.join(LAB, "webview");
  fs.mkdirSync(webviewData, { recursive: true });
  const env = { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: webviewData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` };
  if (disableMultimodal) env.CNP_DISABLE_MULTIMODAL = "1";
  app = spawn(EXE, [], { stdio: "ignore", env });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1500);
}
async function waitForCdp() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) return; } } catch {}
    await sleep(500);
  }
  throw new Error("CDP indisponível");
}

async function runArm(label, disableMultimodal) {
  log(`=== braço ${label} (multimodal ${disableMultimodal ? "DESATIVADO" : "ATIVO"}) ===`);
  launchApp(disableMultimodal);
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));
  const invoke = (cmd, args) => page.evaluate(async ({ cmd, args }) => {
    return await window.__TAURI_INTERNALS__.invoke(cmd, args);
  }, { cmd, args });

  const project = await invoke("create_project", { name: `MM M3 ${label}` });
  const rawImport = await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const imported = typeof rawImport === "string" ? JSON.parse(rawImport) : rawImport;
  log(`projeto ${project.id} | mídia ${imported.mediaId}`);

  // transcrição REAL (cópia por projeto — dados do mantenedor somente leitura)
  // cópia delimitada à AMOSTRA RESERVADA ±2 min de contexto (M3.8: mesma
  // amostra nos dois braços; vídeo cheio fica para o aceite A do M5)
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(seg => seg.end > RESERVED.start - 120 && seg.start < RESERVED.end + 120);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  log(`transcrição real semeada (janela reservada ±2min): ${record.segments.length} segmentos`);

  const t0 = Date.now();
  const jobId = crypto.randomUUID();
  const generation = invoke("generate_clips", {
    projectId: project.id, mediaId: imported.mediaId, jobId,
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" },
  });
  let job = null, lastStage = "";
  for (;;) {
    await sleep(3000);
    job = await invoke("clips_job", {}).catch(() => null);
    if (job && job.stage !== lastStage) { lastStage = job.stage; log(`  job: ${job.state}/${job.stage} ${job.progress}%`); }
    const done = await Promise.race([generation.then(v => ({ v })), sleep(0).then(() => null)]);
    if (done) { generation.result = done.v; break; }
    if (Date.now() - t0 > TIMEOUT_MS) throw new Error(`timeout no braço ${label}`);
    if (job && job.state === "failed") break;
  }
  let result;
  try { result = await generation; } catch (e) { result = { error: String(e) }; }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const clipsFile = path.join(APPDATA, "clips", `${project.id}.json`);
  const collection = fs.existsSync(clipsFile) ? JSON.parse(fs.readFileSync(clipsFile, "utf8")) : null;
  log(`braço ${label}: ${elapsed}s | resultado=${JSON.stringify(result).slice(0, 120)}`);
  const clips = collection?.clips ?? [];
  const summary = {
    label, disableMultimodal, elapsed,
    engine: collection?.engine ?? null,
    jobError: job?.error ?? (result?.error ?? null),
    count: clips.length,
    multimodalEvidence: clips.filter(c => c.multimodal).length,
    clips: clips.map(c => ({
      id: c.id.slice(0, 10), start: +c.start.toFixed(2), end: +c.end.toFixed(2),
      score: c.score, title: c.title,
      multimodal: c.multimodal ? {
        frames: c.multimodal.frames.map(f => +f.toFixed(2)),
        visual: c.multimodal.visual,
        audioEvents: c.multimodal.audioEvents,
        boundaryAdjustments: c.multimodal.boundaryAdjustments,
      } : null,
      analysisSummary: c.analysis?.summary?.slice(0, 200) ?? null,
      inReserved: c.end > RESERVED.start && c.start < RESERVED.end,
    })),
  };
  out.arms.push(summary);
  fs.writeFileSync(path.join(LAB, `m3-arm-${label}.json`), JSON.stringify(collection ?? { error: result?.error }, null, 2));
  log(`  cortes: ${summary.count} | com evidência multimodal: ${summary.multimodalEvidence}`);
  await browser.close().catch(() => {});
  await killApp();
  return summary;
}

async function main() {
  fs.mkdirSync(LAB, { recursive: true });
  const armA = await runArm("A-textual", true);
  const armB = await runArm("B-multimodal", false);
  // comparação na janela reservada
  const reservedA = armA.clips.filter(c => c.inReserved);
  const reservedB = armB.clips.filter(c => c.inReserved);
  out.comparison = {
    reservedWindow: RESERVED,
    A: { total: armA.count, naJanela: reservedA.length, evidencia: reservedA.map(c => c.analysisSummary ? "texto" : "sem análise") },
    B: { total: armB.count, naJanela: reservedB.length, comFrames: reservedB.filter(c => c.multimodal).length },
    boundaryChangesB: armB.clips.filter(c => c.multimodal && (c.multimodal.boundaryAdjustments[0] !== 0 || c.multimodal.boundaryAdjustments[1] !== 0)).length,
  };
  fs.writeFileSync(path.join(LAB, "m3-comparison.json"), JSON.stringify(out, null, 2));
  log("comparação salva em m3-comparison.json");
}

main().catch(async (e) => {
  console.error("[m3] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "m3-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
