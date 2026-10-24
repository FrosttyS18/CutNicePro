/** GATE D (goal-cortes-texto) — percurso COMPLETO pela UI no projeto
 * TXT Baseline (12 cortes reais da IA textual):
 *  1. Exportar o corte 1 pelo botão Baixar + diálogo nativo (ENTER com
 *     nome padrão — padrão que funcionou no M2; aceita SOMENTE arquivo
 *     com o nome padrão do app, validado por duração);
 *  2. Editar o MESMO corte na timeline (dividir + remover segmento do
 *     meio), salvar, REABRIR (persistência) e exportar o EDITADO;
 *  3. Cortes antigos preservados (contagem/ids inalterados).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9399;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const DOWNLOADS = "C:/Users/adcka/Downloads";
let BASELINE_ID = "";
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const DEFAULT_NAME = /^TXT Baseline-corte( \(\d+\))?\.mp4$/i;
const DURATION = 1476.789116;
const log = (m) => console.log(`[gateD] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = {};

let app = null;
let appPid = null;
function launch() {
  const wv = path.join(LAB, "webview-gated");
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
async function boot() {
  launch();
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  let page = null;
  for (let i = 0; i < 20 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error")) ?? null;
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error("sem página");
  return { browser, page };
}
const invoke = (page, cmd, args) => page.evaluate(async ({ cmd, args }) => await window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
const ffprobeDuration = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim());
async function closeDialogs(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => {}); await sleep(350); }
  await sleep(500);
}
async function openLibrary(page) {
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Baseline" }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2000);
}
/** Export via UI: clique Baixar (real, foca o app) → AppActivate(PID) →
 *  ENTER → aceita SOMENTE nome padrão do app novo (mtime > stamp). */
async function exportViaDialog(page, expectedSeconds, label) {
  await closeDialogs(page);
  const stamp = Date.now();
  const card = page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: TITLE_SNIP }).first();
  await card.getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(4500);
  // traz o app (e o diálogo filho) para o PRIMEIRO plano pelo PID
  execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [void][Microsoft.VisualBasic.Interaction]::AppActivate(${appPid})"`, { stdio: "ignore" });
  await sleep(700);
  execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
  let found = null;
  for (let i = 0; i < 90 && !found; i++) {
    await sleep(2000);
    const candidates = fs.readdirSync(DOWNLOADS)
      .map(f => ({ f, full: path.join(DOWNLOADS, f), at: fs.statSync(path.join(DOWNLOADS, f)).mtimeMs }))
      .filter(x => DEFAULT_NAME.test(x.f) && x.at > stamp);
    if (candidates.length) {
      candidates.sort((a, b) => b.at - a.at);
      const size1 = fs.statSync(candidates[0].full).size;
      await sleep(2500);
      if (fs.existsSync(candidates[0].full) && fs.statSync(candidates[0].full).size === size1) found = candidates[0].full;
    }
    const job = await invoke(page, "clips_job", {}).catch(() => null);
    if (job?.state === "failed") return { error: job.error ?? "job falhou" };
  }
  if (!found) return { error: "arquivo padrão não publicado" };
  const got = ffprobeDuration(found);
  const ok = Math.abs(got - expectedSeconds) <= 0.35;
  const dest = path.join(EVIDENCE, label);
  if (ok) fs.copyFileSync(found, dest);
  fs.rmSync(found);
  return { ok, duration: got, expected: +expectedSeconds.toFixed(2), file: ok ? dest : null };
}

const TITLE_SNIP = "Como identificar problemas de"; // corte 1 do baseline

async function main() {
  const before = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "baseline-textual-collection.json"), "utf8")); // projeto restaurado dentro do main()
  const target = before.clips.filter(c => !c.deleted).sort((a, b) => b.score - a.score)[0];
  out.target = { title: target.title, window: [target.start, target.end], score: target.score };

  const { browser, page } = await boot();
  // RESTAURA o projeto TXT Baseline (removido na limpeza da rodada anterior;
  // coleção íntegra preservada em baseline-textual-collection.json)
  const saved = JSON.parse(fs.readFileSync(path.join(EVIDENCE, "baseline-textual-collection.json"), "utf8"));
  const restored = await invoke(page, "create_project", { name: "TXT Baseline" });
  const projectId = restored.id;
  await invoke(page, "import_media", { projectId, srcPath: "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4" });
  fs.copyFileSync(path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json"), path.join(APPDATA, "transcripts", `${projectId}.json`));
  fs.writeFileSync(path.join(APPDATA, "clips", `${projectId}.json`), JSON.stringify(saved));
  await page.evaluate(({ projectId, mediaId }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "baseline.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId, mediaId: MEDIA_ID });
  out.restoredProject = projectId;
  BASELINE_ID = projectId;
  log(`projeto restaurado: ${projectId} (${saved.clips.length} cortes reais)`);
  await page.reload(); await sleep(2000);
  await openLibrary(page);

  // ---------- 1. export original pela UI ----------
  const r1 = await exportViaDialog(page, target.end - target.start, "gateD-corte1-UI.mp4");
  out.exportOriginal = r1;
  log(`1) export UI: ${r1.ok ? "OK " + r1.duration + "s" : "FALHA " + JSON.stringify(r1).slice(0, 120)}`);

  // ---------- 2. editar na timeline ----------
  await closeDialogs(page);
  await page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: TITLE_SNIP }).first()
    .locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1800);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2800);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  const splitBtn = page.getByRole("button", { name: "Dividir no playhead" });
  await splitBtn.waitFor({ state: "visible", timeout: 15000 });
  for (let i = 0; i < 20 && !(await splitBtn.isEnabled().catch(() => false)); i++) await sleep(700);
  if (!(await splitBtn.isEnabled().catch(() => false))) throw new Error("modo corte não confirmado");
  const seekTo = async (t) => {
    const box = await page.locator(".timeline-surface").boundingBox();
    await page.mouse.move(box.x + box.width * (t / DURATION), box.y + Math.min(60, box.height / 2));
    await page.mouse.down(); await page.mouse.up();
    for (let i = 0; i < 15; i++) {
      await sleep(500);
      const txt = await page.evaluate(() => document.querySelector(".timeline-surface")?.getAttribute("aria-valuetext") ?? "");
      const m = txt.match(/(\d+):(\d+)/);
      if (m) { const secs = (+m[1]) * 60 + (+m[2]); if (Math.abs(secs - t) <= Math.max(2, t * 0.012)) return secs; }
    }
    return null;
  };
  const q1 = target.start + (target.end - target.start) * 0.33;
  const q2 = target.start + (target.end - target.start) * 0.80;
  const s1 = await seekTo(q1);
  if (s1 === null) throw new Error("seek 1 não confirmado");
  await splitBtn.click(); await sleep(500);
  const s2 = await seekTo(q2);
  if (s2 === null) throw new Error("seek 2 não confirmado");
  await page.getByRole("button", { name: "Dividir no playhead" }).click(); await sleep(500);
  await seekTo((s1 + s2) / 2); await sleep(300);
  const removeBtn = page.getByRole("button", { name: "Remover trecho do playhead" });
  const removed = await removeBtn.isEnabled().catch(() => false);
  if (removed) { await removeBtn.click(); await sleep(500); }
  const salvar = page.getByRole("button", { name: "Salvar agora" }).first();
  for (let i = 0; i < 12; i++) { if (await salvar.isEnabled().catch(() => false)) { await salvar.click(); break; } await sleep(700); }
  await sleep(1800);
  const planSaved = await page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`)).clipEdits ?? {})[0]?.editPlan?.segments ?? null, BASELINE_ID);
  out.edit = { seeks: { s1, s2 }, removedMiddle: removed, planSaved };
  const kept = planSaved ? planSaved.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0) : null;
  log(`2) editado: plano ${JSON.stringify(planSaved)} (mantido ${kept?.toFixed(2)}s)`);

  // ---------- reabrir: persistência + antigos preservados ----------
  await page.reload(); await sleep(2500);
  await openLibrary(page);
  await closeDialogs(page);
  await page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: TITLE_SNIP }).first()
    .locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1800);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2800);
  const planReopened = await page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`)).clipEdits ?? {})[0]?.editPlan?.segments ?? null, BASELINE_ID);
  out.persisted = JSON.stringify(planReopened) === JSON.stringify(planSaved);
  const after = await invoke(page, "get_clips", { projectId: BASELINE_ID, mediaId: MEDIA_ID }).catch(() => null);
  const oldIds = new Set(before.clips.map(c => c.id));
  out.preservedOldClips = { before: before.clips.length, after: after?.clips?.length ?? "n/a",
    allOldPresent: after?.clips?.every(c => oldIds.has(c.id)) ?? "n/a" };
  log(`3) reaberto: persistiu=${out.persisted} | cortes ${out.preservedOldClips.before}→${out.preservedOldClips.after}, antigos preservados=${out.preservedOldClips.allOldPresent}`);

  // ---------- 4. export EDITADO pela UI ----------
  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click(); await sleep(1600);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2000);
  const r2 = await exportViaDialog(page, kept ?? target.end - target.start, "gateD-corte1-EDITADO-UI.mp4");
  out.exportEdited = { ...r2, expectedKept: kept };
  log(`4) export editado UI: ${r2.ok ? "OK " + r2.duration + "s" : "FALHA " + JSON.stringify(r2).slice(0, 120)}`);

  fs.writeFileSync(path.join(EVIDENCE, "gateD-ui.json"), JSON.stringify(out, null, 2));
  log("evidência em gateD-ui.json");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[gateD] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "gated-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
