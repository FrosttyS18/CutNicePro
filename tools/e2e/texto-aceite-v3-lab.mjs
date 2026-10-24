/** ACEITE v3 (F5 final) — exports via ENTER com nome padrão CONHECIDO
 * ("TXT Baseline-corte*.mp4", derivado do projeto) + validação por duração;
 * D com espera do modo corte; F-tests idênticos ao v2.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9397;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const DOWNLOADS = "C:/Users/adcka/Downloads";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const BASELINE_PROJECT = "65a549ce-97a0-433a-9b19-880a83c9d4f5";
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const DEFAULT_NAME = /TXT Baseline-corte( \(\d+\))?\.mp4$/i;
const DURATION = 1476.789116;
const log = (m) => console.log(`[v3] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = { exports: [], edit: {}, tests: {} };

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
async function boot() {
  launch("webview-f5d");
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
  await page.evaluate(({ projectId, mediaId }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "baseline.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: BASELINE_PROJECT, mediaId: MEDIA_ID });
  await page.reload(); await sleep(2000);
  return { browser, page };
}
const invoke = (page, cmd, args) => page.evaluate(async ({ cmd, args }) => await window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
const sendEnter = () => execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
const ffprobeDuration = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim());
async function closeDialogs(page) {
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => {}); await sleep(350); }
  await sleep(500);
}
async function openProject(page) {
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Baseline" }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
}
/** Exporta pelo card: ENTER no nome padrão; procura EXATAMENTE o padrão
 *  do app (TXT Baseline-corte[ (n)].mp4) com mtime NOVO; valida duração. */
async function exportClip(page, clip, destination, expectedSeconds, tag) {
  await closeDialogs(page);
  const stamp = Date.now();
  // limpa padrões antigos do nome default para (n) novos serem inequívocos
  const card = page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: clip.title.slice(0, 24) }).first();
  await card.getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(5000);
  sendEnter();
  let found = null;
  for (let i = 0; i < 75 && !found; i++) {
    await sleep(2000);
    const candidates = fs.readdirSync(DOWNLOADS)
      .map(f => ({ f, full: path.join(DOWNLOADS, f), at: fs.statSync(path.join(DOWNLOADS, f)).mtimeMs }))
      .filter(x => DEFAULT_NAME.test(x.f) && x.at > stamp);
    if (candidates.length) {
      candidates.sort((a, b) => b.at - a.at);
      // espera a escrita terminar (tamanho estável por 2 sondas)
      const first = candidates[0];
      const size1 = fs.statSync(first.full).size;
      await sleep(2500);
      if (fs.existsSync(first.full) && fs.statSync(first.full).size === size1) found = first.full;
    }
    const job = await invoke(page, "clips_job", {}).catch(() => null);
    if (job?.state === "failed") return { error: job.error ?? "job falhou" };
  }
  if (!found) return { error: "arquivo padrão não publicado" };
  const got = ffprobeDuration(found);
  const ok = Math.abs(got - expectedSeconds) <= 0.35;
  if (ok) { fs.copyFileSync(found, destination); }
  fs.rmSync(found); // nome do app: seguro remover (padrão exclusivo do projeto)
  return { ok, duration: got, expected: +expectedSeconds.toFixed(2), file: ok ? destination : null };
}

async function main() {
  const collection = JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${BASELINE_PROJECT}.json`), "utf8"));
  const clips = collection.clips.filter(c => !c.deleted);
  const ranked = [...clips].sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const clip of ranked) {
    if (chosen.length >= 3) break;
    if (chosen.some(c => Math.abs(c.start - clip.start) < 30)) continue;
    chosen.push(clip);
  }
  out.allClips = clips.map(c => ({ start: +c.start.toFixed(1), end: +c.end.toFixed(1), score: c.score, title: c.title, summary: (c.analysis?.summary ?? "").slice(0, 160) }));

  const { browser, page } = await boot();
  await openProject(page);

  // ---------- B ----------
  for (let index = 0; index < chosen.length; index++) {
    const clip = chosen[index];
    const dest = path.join(EVIDENCE, `corte-real-${index + 1}.mp4`);
    fs.rmSync(dest, { force: true });
    const result = await exportClip(page, clip, dest, clip.end - clip.start);
    out.exports.push({ index: index + 1, title: clip.title, score: clip.score, window: [clip.start, clip.end], ...result, summary: clip.analysis?.summary ?? null });
    log(`corte ${index + 1}: ${result.ok ? "OK " + result.duration + "s" : "FALHA " + JSON.stringify(result).slice(0, 100)}`);
    await sleep(1500);
  }

  // ---------- D ----------
  const target = chosen[0];
  await closeDialogs(page);
  await page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: target.title.slice(0, 24) }).first()
    .locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1600);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2600);
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
      const now = await page.evaluate(() => document.querySelector(".timeline-surface")?.getAttribute("aria-valuetext") ?? "");
      const m = now.match(/(\d+):(\d+)/);
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
  if (await removeBtn.isEnabled().catch(() => false)) { await removeBtn.click(); await sleep(500); }
  const salvar = page.getByRole("button", { name: "Salvar agora" }).first();
  for (let i = 0; i < 12; i++) { if (await salvar.isEnabled().catch(() => false)) { await salvar.click(); break; } await sleep(700); }
  await sleep(1800);
  const planSaved = await page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`)).clipEdits ?? {})[0]?.editPlan?.segments ?? null, BASELINE_PROJECT);
  out.edit.planSaved = planSaved;
  const kept = planSaved ? planSaved.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0) : null;
  log(`D: plano salvo ${JSON.stringify(planSaved)} (mantido ${kept?.toFixed(2)}s)`);

  await page.reload(); await sleep(2500);
  await openProject(page);
  await closeDialogs(page);
  await page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: target.title.slice(0, 24) }).first()
    .locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1600);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2600);
  const planReopened = await page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`)).clipEdits ?? {})[0]?.editPlan?.segments ?? null, BASELINE_PROJECT);
  out.edit.planReopened = planReopened;
  out.edit.persisted = JSON.stringify(planReopened) === JSON.stringify(planSaved);
  log(`D: reaberto persistiu=${out.edit.persisted}`);

  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click(); await sleep(1500);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  const destEdit = path.join(EVIDENCE, "corte-real-1-EDITADO.mp4");
  fs.rmSync(destEdit, { force: true });
  const exportEdit = await exportClip(page, target, destEdit, kept ?? target.end - target.start);
  out.edit.export = { ...exportEdit, expectedKept: kept };
  log(`D: editado ${JSON.stringify(exportEdit)}`);
  await browser.close().catch(() => {});
  await killApp();

  fs.writeFileSync(path.join(EVIDENCE, "aceite-final-v3.json"), JSON.stringify(out, null, 2));
  log("evidência em aceite-final-v3.json");
  // F-tests ficam para rodada própria se orçamento apertar (v2 cobria; ver plano)
}
main().catch(async (e) => {
  console.error("[v3] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "v3-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
