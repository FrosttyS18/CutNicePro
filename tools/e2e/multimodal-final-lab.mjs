/** LAB FINAL (matriz A–I, goal-cortes-multimodais) — gate A no app REAL:
 * projeto novo + mídia 24,6 min (dedupe) + transcrição REAL completa (568
 * segs) no workspace (estado pós-ASR legítimo) → GERAÇÃO AUTOMÁTICA (M5,
 * sem clique em "Gerar") com motor MULTIMODAL (framing incluso) → exportar
 * os 3 melhores cortes distintos → ffprobe (gate E) → rubrica C → amostras
 * para aceite editorial. Memória amostrada durante tudo (gate G).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const PORT = 9388;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const DOWNLOADS = "C:/Users/adcka/Downloads";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-multimodais-2026-10-23";
const PROJECT = "MM Final";
const MAX_GENERATION_MS = 150 * 60 * 1000;

const log = (m) => console.log(`[final] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = { gates: {}, memory: [] };

let app = null;
function launchApp() {
  const webviewData = path.join(LAB, "webview-final");
  fs.mkdirSync(webviewData, { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: webviewData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1500);
}
function memMB() {
  try {
    const value = execSync(`powershell -NoProfile -Command "(Get-Process cutnicepro,msedgewebview2,llama-server -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1MB"`, { encoding: "utf8" });
    return Math.round(parseFloat(value.trim()));
  } catch { return -1; }
}

async function main() {
  launchApp();
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error")) ?? null;
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error("nenhuma página utilizável");
  const invoke = (cmd, args) => page.evaluate(async ({ cmd, args }) => {
    return await window.__TAURI_INTERNALS__.invoke(cmd, args);
  }, { cmd, args });

  // ---- gate A: projeto + mídia + transcrição REAL no workspace (pós-ASR) ----
  const project = await invoke("create_project", { name: PROJECT });
  const rawImport = await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const imported = typeof rawImport === "string" ? JSON.parse(rawImport) : rawImport;
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, name, analysis, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "1"); // padrão já é ligado; explícito
    const workspace = {
      version: 2,
      media: { kind: "local", name, videoId: null, url: null,
        width: analysis?.width ?? null, height: analysis?.height ?? null,
        duration: analysis?.durationMs ? analysis.durationMs / 1000 : null, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1,
        muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    };
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify(workspace));
  }, { projectId: project.id, mediaId: imported.mediaId, name: path.basename(MEDIA), analysis: imported.analysis, segments: record.segments });
  log(`projeto ${project.id} | mídia ${imported.mediaId} | transcrição REAL ${record.segments.length} segs no workspace (pós-ASR)`);
  await page.reload(); await sleep(2500);

  // ---- abre o projeto: o M5 deve disparar a geração SOZINHO ----
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: PROJECT }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  log("projeto aberto; esperando o disparo AUTOMÁTICO da geração (M5)…");

  // ---- espera a geração automática concluir (com memória — gate G) ----
  const t0 = Date.now();
  let autoStarted = false, job = null, lastStage = "";
  while (Date.now() - t0 < MAX_GENERATION_MS) {
    job = await invoke("clips_job", {}).catch(() => null);
    if (job && job.state === "running" && job.operation === "generate") {
      if (!autoStarted) { autoStarted = true; out.gates.autoTrigger = { detectedAt: Date.now() - t0, ms: Date.now() - t0 }; log("GERAÇÃO AUTOMÁTICA detectada (sem clique) ✓"); }
      if (job.stage !== lastStage) { lastStage = job.stage; log(`  job ${job.stage} ${job.progress}%`); }
    }
    if (autoStarted && job && job.state !== "running") { log(`job final: ${job.state}${job.error ? " erro: " + job.error : ""}`); break; }
    out.memory.push({ t: Math.round((Date.now() - t0) / 1000), mb: memMB() });
    await sleep(15000);
  }
  out.gates.autoTrigger = out.gates.autoTrigger ?? { detected: autoStarted };
  out.gates.autoTrigger.elapsedMs = Date.now() - t0;
  if (!autoStarted) throw new Error("geração automática NÃO disparou");
  if (job?.state === "failed") throw new Error("geração falhou: " + job.error);

  // ---- coleção gerada (gate B) ----
  const clipsFile = path.join(APPDATA, "clips", `${project.id}.json`);
  const collection = JSON.parse(fs.readFileSync(clipsFile, "utf8"));
  fs.copyFileSync(clipsFile, path.join(EVIDENCE, "final-collection.json"));
  const clips = collection.clips.filter(c => !c.deleted);
  out.gates.B = {
    engine: collection.engine?.backend,
    total: clips.length,
    comEvidenciaMultimodal: clips.filter(c => c.multimodal).length,
    comFraming: clips.filter(c => c.multimodal?.framing).length,
  };
  log(`coleção: ${out.gates.B.total} cortes | multimodal ${out.gates.B.comEvidenciaMultimodal} | framing ${out.gates.B.comFraming} | engine ${out.gates.B.engine}`);

  // ---- exporta os 3 melhores DISTINTOS (Baixar → diálogo nativo → ENTER) ----
  const ranked = [...clips].sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const clip of ranked) {
    if (chosen.length >= 3) break;
    if (chosen.some(c => Math.abs(c.start - clip.start) < 30)) continue; // distintos
    chosen.push(clip);
  }
  // volta para a visão de cortes (se o auto-flow já mostrou) e exporta
  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click().catch(() => {}); await sleep(1500);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click().catch(() => {}); await sleep(1800);
  const exports = [];
  for (let index = 0; index < chosen.length; index++) {
    const clip = chosen[index];
    const card = page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: clip.title.slice(0, 24) }).first();
    const before = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith(".mp4"));
    await card.getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(5000);
    execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
    let file = null;
    for (let i = 0; i < 90 && !file; i++) {
      await sleep(2000);
      const after = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith(".mp4") && !before.includes(f));
      if (after.length) file = path.join(DOWNLOADS, after[0]);
      const j = await invoke("clips_job", {}).catch(() => null);
      if (j?.state === "failed") break;
    }
    if (!file) { exports.push({ clip: clip.id, error: "não publicado" }); continue; }
    const dest = path.join(EVIDENCE, `final-corte-${index + 1}.mp4`);
    fs.copyFileSync(file, dest);
    fs.rmSync(file);
    const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${dest}"`).toString().trim();
    exports.push({
      index: index + 1, clipId: clip.id, title: clip.title, score: clip.score,
      window: [clip.start, clip.end], expectedDuration: clip.end - clip.start,
      mp4Duration: Number(dur), file: dest,
      multimodal: clip.multimodal ? { visual: clip.multimodal.visual.slice(0, 120), framing: clip.multimodal.framing ?? null } : null,
    });
    log(`corte ${index + 1} exportado: ${clip.title.slice(0, 40)} | ${dur}s vs esperado ${clip.end - clip.start}s`);
    await sleep(2000);
  }
  out.gates.exports = exports;
  out.gates.E = exports.filter(e => e.mp4Duration && Math.abs(e.mp4Duration - e.expectedDuration) <= 0.3).length;

  fs.writeFileSync(path.join(LAB, "final-results.json"), JSON.stringify(out, null, 2));
  log(`resultados em ${path.join(LAB, "final-results.json")}`);
  await browser.close().catch(() => {});
  await killApp();
}

main().catch(async (e) => {
  console.error("[final] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "final-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
