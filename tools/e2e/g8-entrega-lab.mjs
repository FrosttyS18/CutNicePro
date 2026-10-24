/** G8 (goal-recuperacao-autoclip) — aceite real com o pipeline NOVO
 * (refine de fronteiras G6 ativo): gerar 3+ cortes REAIS por texto na
 * janela reservada original (1000–1300, já exposta — esta geração é para
 * ENTREGA, não teste cego), exportá-los pelo pipeline do app com nomes
 * identificáveis, verificar timestamps/created/badge e aplicar a rubrica
 * depois (fora do script). Rejeitados também listados (gate B honesto).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9407;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const log = (m) => console.log(`[g8] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = {};

let app = null, appPid = null;
function launch() {
  const wv = path.join(LAB, "webview-g8");
  fs.mkdirSync(wv, { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: wv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
  appPid = app.pid;
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1500);
}
const ffprobeDuration = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim());
const esc = (s) => s.replace(/([()+^%~{}])/g, "{$1}");

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

  const project = await invoke("create_project", { name: "G8 Entrega" });
  await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(s => s.start >= 880 && s.end <= 1420);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "entrega.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: MEDIA_ID, segments: record.segments });
  await sleep(1500);
  log(`projeto ${project.id} | ${record.segments.length} segs | pipeline COM refine de fronteiras`);

  // geração real (texto, Gemma 12B, janela 880-1420 = contexto amplo p/ 3+ cortes)
  const t0 = Date.now();
  let job = null, lastStage = "";
  const gen = invoke("generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(),
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  for (;;) {
    await sleep(5000);
    job = await invoke("clips_job", {}).catch(() => null);
    if (job && job.stage !== lastStage) { lastStage = job.stage; log(`  ${job.stage} ${job.progress}%`); }
    const done = await Promise.race([gen.then(v => ({ v })), sleep(0).then(() => null)]);
    if (done) { gen.result = done.v; break; }
    if ((job && job.state === "failed") || Date.now() - t0 > 35 * 60 * 1000) break;
  }
  let result; try { result = await gen; } catch (e) { result = { error: String(e) }; }
  out.generation = { elapsedS: Math.round((Date.now() - t0) / 1000), jobState: job?.state, jobError: job?.error ?? result?.error ?? null };
  const clipsFile = path.join(APPDATA, "clips", `${project.id}.json`);
  const collection = fs.existsSync(clipsFile) ? JSON.parse(fs.readFileSync(clipsFile, "utf8")) : null;
  const clips = collection?.clips ?? [];
  out.backend = collection?.engine?.backend;
  log(`geração: ${out.generation.elapsedS}s | ${clips.length} cortes | erro ${out.generation.jobError}`);

  // confere: created_at_ms presente nos NOVOS (todos são novos neste projeto)
  const withCreated = clips.filter(c => c.createdAtMs).length;
  out.createdMs = { total: clips.length, withCreated };
  log(`createdAtMs: ${withCreated}/${clips.length}`);

  // abre o projeto na UI p/ ver badge Novo + exporta os 3 melhores distintos
  await page.evaluate(() => location.reload()); await sleep(4000);
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await page.getByRole("button", { name: "Meus Projetos" }).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "G8 Entrega" }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2000);
  // badge Novo visível ANTES de abrir
  out.badgeBefore = await page.evaluate(() => document.querySelectorAll(".clip-card__new").length);
  out.whenLabels = await page.evaluate(() => [...document.querySelectorAll(".clip-card__when")].slice(0, 3).map(e => e.textContent));
  log(`badge Novo: ${out.badgeBefore}; quando: ${JSON.stringify(out.whenLabels)}`);
  const shotFile = path.join(EVIDENCE, "g8-galeria-badge-novo.png");
  await page.screenshot({ path: shotFile });

  const ranked = [...clips].sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const clip of ranked) {
    if (chosen.length >= 3) break;
    if (chosen.some(c => Math.abs(c.start - clip.start) < 30)) continue;
    chosen.push(clip);
  }
  out.all = clips.map(c => ({ start: +c.start.toFixed(1), end: +c.end.toFixed(1), score: c.score, title: c.title,
    created: c.createdAtMs ?? null, review: c.review, summary: (c.analysis?.summary ?? "").slice(0, 200),
    analysisError: c.analysisError ?? null }));

  // exporta via UI (clique + ENTER com AppActivate — padrão que funcionou no G3A)
  const exports = [];
  for (let index = 0; index < chosen.length; index++) {
    const clip = chosen[index];
    for (let i = 0; i < 3; i++) await page.keyboard.press("Escape").catch(() => {});
    await sleep(600);
    const card = page.locator('[class*="clip-card"]').filter({ hasText: clip.title.slice(0, 20) }).first();
    const stamp = Date.now();
    await card.getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(4500);
    execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [void][Microsoft.VisualBasic.Interaction]::AppActivate(${appPid}); Start-Sleep -Milliseconds 400; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
    let file = null;
    for (let i = 0; i < 90 && !file; i++) {
      await sleep(2000);
      const found = fs.readdirSync("C:/Users/adcka/Downloads")
        .map(f => ({ f, full: path.join("C:/Users/adcka/Downloads", f), at: fs.statSync(path.join("C:/Users/adcka/Downloads", f)).mtimeMs }))
        .filter(x => /G8 Entrega/.test(x.f) && x.f.endsWith(".mp4") && x.at > stamp)
        .sort((a, b) => b.at - a.at);
      if (found.length) {
        const size1 = fs.statSync(found[0].full).size;
        await sleep(2500);
        if (fs.existsSync(found[0].full) && fs.statSync(found[0].full).size === size1) file = found[0].full;
      }
    }
    if (!file) { exports.push({ index: index + 1, title: clip.title, error: "não publicado" }); continue; }
    const label = (clip.title.match(/[\p{L}\p{N}]+/gu) ?? ["corte"]).slice(0, 5).join("-").slice(0, 48);
    const dest = path.join(EVIDENCE, `g8-corte-${index + 1}-${label}.mp4`);
    fs.copyFileSync(file, dest); fs.rmSync(file);
    exports.push({ index: index + 1, title: clip.title, score: clip.score,
      window: [+clip.start.toFixed(2), +clip.end.toFixed(2)], expected: +(clip.end - clip.start).toFixed(2),
      mp4: ffprobeDuration(dest), file: dest });
    log(`corte ${index + 1} exportado: ${path.basename(dest)} (${exports[exports.length - 1].mp4}s vs ${exports[exports.length - 1].expected}s)`);
    await sleep(2000);
  }
  out.exports = exports;

  // abre UM clipe (inspect) → badge deve sumir DEPOIS (persistido)
  await page.locator('[class*="clip-card"]').filter({ hasText: chosen[0].title.slice(0, 20) }).first()
    .locator('[class*="clip-card__open"]').first().click(); await sleep(2000);
  for (let i = 0; i < 3; i++) await page.keyboard.press("Escape").catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  out.badgeAfterOpenOne = await page.evaluate(() => document.querySelectorAll(".clip-card__new").length);
  log(`badge após abrir 1: ${out.badgeAfterOpenOne} (antes ${out.badgeBefore})`);

  fs.writeFileSync(path.join(EVIDENCE, "g8-entrega.json"), JSON.stringify(out, null, 2));
  log("evidência em g8-entrega.json");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[g8] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "g8-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
