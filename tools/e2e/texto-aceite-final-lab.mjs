/** ACEITE FINAL (F5, goal-cortes-texto) — no projeto TXT Baseline (12
 * cortes REAIS gerados por texto no vídeo inteiro):
 *  B: exporta os 3 melhores distintos (via UI Baixar + diálogo nativo);
 *  D: edita UM corte real na timeline (plano com remoção interna pela UI),
 *     salva, REABRE e exporta; conferências por ffprobe + workspace;
 *  F: cancela geração pequena em curso, reabre (sem reinício), retry
 *     explícito, edição de transcrição → análise desatualizada,
 *     regeneração sem duplicatas.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9395;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const DOWNLOADS = "C:/Users/adcka/Downloads";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const BASELINE_PROJECT = "65a549ce-97a0-433a-9b19-880a83c9d4f5"; // TXT Baseline
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const log = (m) => console.log(`[f5] ${new Date().toISOString().slice(11, 19)} ${m}`);
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
  launch("webview-f5b");
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
  return { browser, page };
}
const invoke = (page, cmd, args) => page.evaluate(async ({ cmd, args }) => await window.__TAURI_INTERNALS__.invoke(cmd, args), { cmd, args });
const sendEnter = () => execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
const ffprobeDuration = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim());

async function openProject(page) {
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Baseline" }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
}
const closeDialogs = async (page) => {
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => {}); await sleep(400); }
  await page.evaluate(() => { document.querySelectorAll("dialog[open]").forEach(d => d.close?.()); }).catch(() => {});
  await sleep(600);
};

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
  out.allClips = clips.map(c => ({ start: +c.start.toFixed(1), end: +c.end.toFixed(1), score: c.score, title: c.title }));
  log(`3 escolhidos (de ${clips.length}, por nota e distintos): ${chosen.map(c => c.score + "/" + c.title.slice(0, 30)).join(" | ")}`);

  let { browser, page } = await boot();
  // perfil NOVO: semeia o workspace do projeto Baseline (mesmo estado pós-geração)
  await page.evaluate(({ projectId, mediaId }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "baseline.mp4", videoId: null, url: null, width: 1920, height: 1080,
        duration: 1476.789116, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false,
        background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: BASELINE_PROJECT, mediaId: MEDIA_ID });
  await page.reload(); await sleep(2000);
  await openProject(page);

  // ---------- B: exporta 3 via UI ----------
  for (let index = 0; index < chosen.length; index++) {
    const clip = chosen[index];
    await closeDialogs(page);
    const card = page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: clip.title.slice(0, 24) }).first();
    const before = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith(".mp4"));
    await card.getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(5000);
    sendEnter();
    let file = null;
    for (let i = 0; i < 90 && !file; i++) {
      await sleep(2000);
      const after = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith(".mp4") && !before.includes(f));
      if (after.length) file = path.join(DOWNLOADS, after[0]);
    }
    if (!file) { out.exports.push({ index, clipId: clip.id, error: "não publicado" }); continue; }
    const dest = path.join(EVIDENCE, `corte-real-${index + 1}.mp4`);
    fs.copyFileSync(file, dest); fs.rmSync(file);
    const duration = ffprobeDuration(dest);
    out.exports.push({ index: index + 1, title: clip.title, score: clip.score,
      window: [clip.start, clip.end], expected: +(clip.end - clip.start).toFixed(2), mp4: duration,
      delta: +(duration - (clip.end - clip.start)).toFixed(2), file: dest,
      summary: clip.analysis?.summary ?? null });
    log(`corte ${index + 1}: ${clip.title.slice(0, 40)} | mp4 ${duration}s vs ${clip.end - clip.start}s`);
    await sleep(2000);
  }

  // ---------- D: edita o corte 1 na timeline (remoção interna), salva, reabre, exporta ----------
  const target = chosen[0];
  await closeDialogs(page);
  const card = page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: target.title.slice(0, 24) }).first();
  await card.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1500);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2500);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  const duration = 1476.789116;
  const seekTo = async (t) => {
    const box = await page.locator(".timeline-surface").boundingBox();
    const x = box.x + box.width * (t / duration);
    const y = box.y + Math.min(60, box.height / 2);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up(); await sleep(1100);
  };
  // divide no meio e remove o segundo segmento (remoção interna REAL pela UI)
  const mid = target.start + (target.end - target.start) * 0.45;
  await seekTo(mid);
  await page.getByRole("button", { name: "Dividir no playhead" }).click(); await sleep(500);
  const planAfterSplit = await page.evaluate((id) => {
    const ws = JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`));
    return ws.clipEdits ? Object.values(ws.clipEdits)[0]?.editPlan?.segments?.length ?? 0 : ws.settings?.editPlan?.segments?.length ?? 0;
  }, BASELINE_PROJECT).catch(() => -1);
  await seekTo(mid + 5);
  await page.getByRole("button", { name: "Remover trecho do playhead" }).click(); await sleep(500);
  const salvar = page.getByRole("button", { name: "Salvar agora" }).first();
  for (let i = 0; i < 10; i++) { if (await salvar.isEnabled().catch(() => false)) { await salvar.click(); break; } await sleep(700); }
  await sleep(1500);
  const planSaved = await page.evaluate((id) => {
    const ws = JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`));
    const edits = ws.clipEdits ?? {};
    const settings = Object.values(edits)[0];
    return settings?.editPlan?.segments ?? null;
  }, BASELINE_PROJECT);
  out.edit.planAfterSplit = planAfterSplit;
  out.edit.planSaved = planSaved;
  log(`D: plano após dividir=${planAfterSplit} segs; salvo=${JSON.stringify(planSaved)}`);

  // reabrir e exportar o editado
  await page.reload(); await sleep(2500);
  await openProject(page);
  await page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: target.title.slice(0, 24) }).first()
    .locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1500);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2500);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  const planReopened = await page.evaluate((id) => {
    const ws = JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`));
    return Object.values(ws.clipEdits ?? {})[0]?.editPlan?.segments ?? null;
  }, BASELINE_PROJECT);
  out.edit.planReopened = planReopened;
  // exporta o EDITADO pela UI (voltar → card → Baixar)
  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click(); await sleep(1500);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  const before = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith(".mp4"));
  await page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: target.title.slice(0, 24) }).first()
    .getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(5000);
  sendEnter();
  let file = null;
  for (let i = 0; i < 90 && !file; i++) {
    await sleep(2000);
    const after = fs.readdirSync(DOWNLOADS).filter(f => f.endsWith(".mp4") && !before.includes(f));
    if (after.length) file = path.join(DOWNLOADS, after[0]);
  }
  if (file) {
    const dest = path.join(EVIDENCE, "corte-real-1-EDITADO.mp4");
    fs.copyFileSync(file, dest); fs.rmSync(file);
    const kept = planReopened ? planReopened.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0) : null;
    out.edit.exported = { file: dest, mp4: ffprobeDuration(dest), expectedKept: kept,
      original: +(target.end - target.start).toFixed(2) };
    log(`D: editado exportado ${out.edit.exported.mp4}s (original ${out.edit.exported.original}s, esperado ~${kept}s)`);
  } else { out.edit.exported = { error: "não publicado" }; }
  await browser.close().catch(() => {});
  await killApp();

  // ---------- F: cancelamento / retry / cache (janela pequena, ciclos curtos) ----------
  ({ browser, page } = await boot());
  const project = await invoke(page, "create_project", { name: "TXT F-tests" });
  await invoke(page, "import_media", { projectId: project.id, srcPath: "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4" });
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(s => s.start >= 360 && s.end <= 720); // janela curta p/ ciclos rápidos
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "f.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: MEDIA_ID, segments: record.segments });
  await page.reload(); await sleep(2000);

  // F1: cancela durante inferência
  const jobId = crypto.randomUUID();
  const gen = invoke(page, "generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId, options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  await sleep(25000); // meio da inferência
  const cancelled = await invoke(page, "cancel_clips", { jobId }).catch(e => String(e));
  const cancelResult = await gen;
  const clipsAfterCancel = fs.existsSync(path.join(APPDATA, "clips", `${project.id}.json`));
  out.tests.cancel = { cancelSent: cancelled, result: JSON.stringify(cancelResult).slice(0, 120), publishedPartial: clipsAfterCancel };
  log(`F cancel: enviado=${cancelled} | publicação parcial=${clipsAfterCancel}`);

  // F2: reabrir SEM reinício automático (autoGenerate=0 já garante; e o guarda durável)
  await page.reload(); await sleep(2500);
  const jobAfterReopen = await invoke(page, "clips_job", {}).catch(() => null);
  out.tests.reopenNoRestart = { job: jobAfterReopen?.state ?? null, autoGenerate: await page.evaluate(() => localStorage.getItem("cnp.autoGenerate")) };
  log(`F reopen: job=${jobAfterReopen?.state ?? "nenhum"} (sem reinício) ✓`);

  // F3: retry explícito (botão Gerar) até concluir — geração CURTA completa
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1500);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT F-tests" }).first().click(); await sleep(2000);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  const t0 = Date.now();
  const retry = await invoke(page, "generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(), options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  const retryElapsed = Math.round((Date.now() - t0) / 1000);
  const first = JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${project.id}.json`), "utf8"));
  out.tests.retry = { elapsedS: retryElapsed, clips: first.clips.length, error: retry?.error ?? null };
  log(`F retry: ${retryElapsed}s | ${first.clips.length} cortes`);

  // F4: edição de transcrição → invalidação (stale) + regeneração sem duplicatas
  const edited = JSON.parse(fs.readFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), "utf8"));
  edited.segments[0].text = "TEXTO EDITADO PELO USUÁRIO PARA INVALIDAR ANÁLISE " + Math.random().toString(36).slice(2, 8);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(edited));
  const afterEdit = await invoke(page, "get_clips", { projectId: project.id, mediaId: MEDIA_ID }).catch(() => null);
  const staleCount = afterEdit?.clips?.filter(c => c.analysisStale).length ?? "n/a";
  const regen = await invoke(page, "generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(), options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  const afterRegen = JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${project.id}.json`), "utf8"));
  const ids = new Set(afterRegen.clips.map(c => c.id));
  // duplicatas por CONTEÚDO (sobreposição >80%)
  let overlaps = 0;
  for (let i = 0; i < afterRegen.clips.length; i++) for (let j = i + 1; j < afterRegen.clips.length; j++) {
    const a = afterRegen.clips[i], b = afterRegen.clips[j];
    const inter = Math.min(a.end, b.end) - Math.max(a.start, b.start);
    if (inter > 0.8 * Math.min(a.end - a.start, b.end - b.start)) overlaps++;
  }
  out.tests.cacheInvalidation = {
    staleAfterEdit: staleCount,
    regenError: regen?.error ?? null,
    clipsAfterRegen: afterRegen.clips.length,
    uniqueIds: ids.size === afterRegen.clips.length,
    contentOverlaps: overlaps,
  };
  log(`F cache: stale=${staleCount} | após regen ${afterRegen.clips.length} cortes, ids únicos=${ids.size === afterRegen.clips.length}, sobreposições=${overlaps}`);
  await browser.close().catch(() => {});
  await killApp();

  fs.writeFileSync(path.join(EVIDENCE, "aceite-final-result.json"), JSON.stringify(out, null, 2));
  log(`evidência completa em aceite-final-result.json`);
}
main().catch(async (e) => {
  console.error("[f5] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "f5-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
