/** GATE F (goal-cortes-texto) — UI do Tauri real, ciclos curtos:
 * 1) cancelar geração EM CURSO → sem publicação parcial;
 * 2) reabrir projeto → sem reinício automático;
 * 3) retry explícito (geração completa em janela curta);
 * 4) editar transcrição → análises marcadas desatualizadas (invalidação);
 * 5) regenerar → sem duplicatas (ids únicos + sem sobreposição de conteúdo);
 * 6) recursos liberados entre ciclos (RAM do grupo antes/depois).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9398;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const log = (m) => console.log(`[gateF] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = {};

let app = null;
function launch() {
  const wv = path.join(LAB, "webview-gatef2");
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
const ram = () => { try {
  return Math.round(parseFloat(execSync(`powershell -NoProfile -Command "(Get-Process cutnicepro,msedgewebview2,llama-completion -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1MB"`, { encoding: "utf8" }).trim()));
} catch { return -1; } };
const procs = () => { try {
  return parseInt(execSync(`powershell -NoProfile -Command "(Get-Process llama-completion -ErrorAction SilentlyContinue | Measure-Object).Count"`, { encoding: "utf8" }).trim(), 10);
} catch { return -1; } };

async function main() {
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
  const invoke = (cmd, args) => page.evaluate(async ({ cmd, args }) => await window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });

  const project = await invoke("create_project", { name: "TXT GateF2" });
  await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(s => s.start >= 360 && s.end <= 720);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "gatef.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: MEDIA_ID, segments: record.segments });
  await page.reload(); await sleep(2000);
  log(`projeto ${project.id} | janela 360–720 (${record.segments.length} segs) | RAM base ${ram()}MB`);

  // ---- 1) cancelar DURANTE inferência ----
  const jobId = crypto.randomUUID();
  const gen = invoke("generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId,
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  for (let i = 0; i < 40; i++) { // espera llama-completion em execução
    await sleep(1000);
    if (procs() >= 1) break;
  }
  const engineRunning = procs() >= 1;
  await sleep(15000); // deixa inferência progredir
  const cancelRaw = await invoke("cancel_clips", { jobId }).catch(e => "ERRO: " + String(e));
  const cancelResult = await gen;
  // espera o processo do motor encerrar (cancelamento efetivo)
  let engineStopped = false;
  for (let i = 0; i < 30; i++) { await sleep(1000); if (procs() === 0) { engineStopped = true; break; } }
  const partialPublished = fs.existsSync(path.join(APPDATA, "clips", `${project.id}.json`));
  out.cancel = { engineRunningBeforeCancel: engineRunning, cancelRaw: String(cancelRaw),
    resultIsError: Boolean(cancelResult?.error), resultDetail: JSON.stringify(cancelResult).slice(0, 160),
    partialPublished, engineStopped, engineProcsAfter: procs() };
  log(`1) cancel: motor=${engineRunning}, resp=${String(cancelRaw).slice(0, 60)}, parcial=${partialPublished}, motor encerrou=${engineStopped}`);

  // ---- 2) reabrir SEM reinício (navegação pela UI; reload derruba o WebView) ----
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Escape").catch(() => {}); await sleep(300);
  }
  const back = page.getByRole("button", { name: /Voltar ao projeto|Voltar aos projetos/ }).first();
  if (await back.count()) { await back.click(); await sleep(1500); }
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  const jobAfter = await invoke("clips_job", {}).catch(() => null);
  out.reopen = { jobState: jobAfter?.state ?? "nenhum", engineProcs: procs(), marker: await page.evaluate((id) => localStorage.getItem(`cnp.autoGenerated.${id}`), project.id) };
  log(`2) reopen: job=${jobAfter?.state ?? "nenhum"}, motor=${procs()}, guarda=${out.reopen.marker}`);

  // ---- 3) retry explícito (geração completa) ----
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT GateF2" }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  const t0 = Date.now();
  const retry = await invoke("generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(),
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  const retryElapsed = Math.round((Date.now() - t0) / 1000);
  const first = JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${project.id}.json`), "utf8"));
  out.retry = { elapsedS: retryElapsed, error: retry?.error ?? null, clips: first.clips.length, engineProcsAfter: procs(), ramAfter: ram() };
  log(`3) retry: ${retryElapsed}s | ${first.clips.length} cortes | motor após=${procs()} | RAM ${out.retry.ramAfter}MB`);

  // ---- 4) editar transcrição → invalidação ----
  const edited = JSON.parse(fs.readFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), "utf8"));
  edited.segments[0].text = "TEXTO EDITADO PELO USUÁRIO PARA INVALIDAR ANÁLISE " + Math.random().toString(36).slice(2, 8);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(edited));
  await sleep(1000);
  await page.getByRole("button", { name: /Voltar ao projeto|Voltar aos projetos/ }).first().click().catch(async () => {
    await page.keyboard.press("Escape").catch(() => {});
  }); await sleep(1500);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT GateF2" }).first().click(); await sleep(2200);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  const afterEdit = await invoke("get_clips", { projectId: project.id, mediaId: MEDIA_ID }).catch(() => null);
  out.stale = { markedStale: afterEdit?.clips?.filter(c => c.analysisStale).length ?? "n/a", total: afterEdit?.clips?.length ?? "n/a" };
  log(`4) stale após edição: ${out.stale.markedStale}/${out.stale.total}`);

  // ---- 5) regenerar → sem duplicatas ----
  const regen = await invoke("generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(),
    options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  const after = JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${project.id}.json`), "utf8"));
  const ids = new Set(after.clips.map(c => c.id));
  let overlaps = 0;
  for (let i = 0; i < after.clips.length; i++) for (let j = i + 1; j < after.clips.length; j++) {
    const a = after.clips[i], b = after.clips[j];
    const inter = Math.min(a.end, b.end) - Math.max(a.start, b.start);
    if (inter > 0.8 * Math.min(a.end - a.start, b.end - b.start)) overlaps++;
  }
  out.dupes = { clipsAfterRegen: after.clips.length, uniqueIds: ids.size === after.clips.length, contentOverlaps: overlaps, regenError: regen?.error ?? null, engineProcsAfter: procs() };
  log(`5) regen: ${after.clips.length} cortes | ids únicos=${ids.size === after.clips.length} | sobreposições=${overlaps}`);

  fs.writeFileSync(path.join(EVIDENCE, "gateF-ui.json"), JSON.stringify(out, null, 2));
  log("evidência em gateF-ui.json");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[gateF] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "gatef2-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
