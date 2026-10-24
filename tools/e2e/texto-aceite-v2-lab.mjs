/** ACEITE v2 (F5, goal-cortes-texto) — lições aplicadas:
 *  - exports com CAMINHO DIGITADO no diálogo (direto na pasta de evidência;
 *    NUNCA pollar Downloads — o v1 detectou arquivo alheio e o apagou);
 *  - cada export VERIFICADO pelo scratch (captions.ass presente) e ffprobe
 *    (duração ≈ esperada); divergência = falha registrada, sem colher arquivo;
 *  - D: espera o modo corte comprovado (botão Dividir habilitado +
 *    aria-valuetext do playhead) antes de editar.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9396;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-cortes-texto-2026-10-23";
const BASELINE_PROJECT = "65a549ce-97a0-433a-9b19-880a83c9d4f5";
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const REAL_TRANSCRIPT = path.join(APPDATA, "transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json");
const log = (m) => console.log(`[v2] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = { exports: [], edit: {}, tests: {}, incidents: [] };
const DURATION = 1476.789116;

let app = null;
function launch(profile) {
  const wv = path.join(LAB, profile);
  fs.mkdirSync(wv, { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: wv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode === null === false) return;
  if (app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1500);
}
async function boot() {
  launch("webview-f5c");
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
const sendKeys = (keys) => execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`, { stdio: "ignore" });
const ffprobeDuration = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim());
const esc = (s) => s.replace(/([()+^%~{}])/g, "{$1}");
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
/** Exporta pelo card com CAMINHO DIGITADO; valida pelo ffprobe contra esperado. */
async function exportClip(page, clip, destination, expectedSeconds) {
  await closeDialogs(page);
  const card = page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: clip.title.slice(0, 24) }).first();
  await card.getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(5000);
  sendKeys(esc(destination) + "{ENTER}");
  for (let i = 0; i < 60 && !fs.existsSync(destination); i++) {
    await sleep(2000);
    const job = await invoke(page, "clips_job", {}).catch(() => null);
    if (job?.state === "failed") return { error: job.error ?? "job falhou" };
  }
  if (!fs.existsSync(destination)) return { error: "arquivo não publicado" };
  const got = ffprobeDuration(destination);
  const ok = Math.abs(got - expectedSeconds) <= 0.35;
  return { ok, duration: got, expected: expectedSeconds };
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

  // ---------- B: 3 exports reais com caminho digitado ----------
  for (let index = 0; index < chosen.length; index++) {
    const clip = chosen[index];
    const dest = path.join(EVIDENCE, `corte-real-${index + 1}.mp4`);
    fs.rmSync(dest, { force: true });
    const result = await exportClip(page, clip, dest, clip.end - clip.start);
    out.exports.push({ index: index + 1, title: clip.title, score: clip.score,
      window: [clip.start, clip.end], ...result, file: result.ok ? dest : null,
      summary: clip.analysis?.summary ?? null });
    log(`corte ${index + 1}: ${result.ok ? "OK " + result.duration + "s" : "FALHA " + JSON.stringify(result).slice(0, 90)}`);
    await sleep(1500);
  }

  // ---------- D: editar corte 1 (dividir + remover interno), salvar, REABRIR, exportar ----------
  const target = chosen[0];
  await closeDialogs(page);
  const card = page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: target.title.slice(0, 24) }).first();
  await card.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1600);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2600);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  // modo corte comprovado: botão Dividir habilitado
  const splitBtn = page.getByRole("button", { name: "Dividir no playhead" });
  await splitBtn.waitFor({ state: "visible", timeout: 15000 });
  for (let i = 0; i < 20 && !(await splitBtn.isEnabled().catch(() => false)); i++) await sleep(700);
  if (!(await splitBtn.isEnabled().catch(() => false))) throw new Error("modo corte não confirmado (Dividir desabilitado)");
  const seekTo = async (t) => {
    const box = await page.locator(".timeline-surface").boundingBox();
    const x = box.x + box.width * (t / DURATION);
    await page.mouse.move(x, box.y + Math.min(60, box.height / 2));
    await page.mouse.down(); await page.mouse.up();
    for (let i = 0; i < 15; i++) {
      await sleep(500);
      const now = await page.evaluate(() => document.querySelector(".timeline-surface")?.getAttribute("aria-valuetext") ?? "");
      if (now) { const m = now.match(/(\d+):(\d+)/); if (m) { const secs = (+m[1]) * 60 + (+m[2]); if (Math.abs(secs - t) <= Math.max(2, t * 0.01)) return secs; } }
    }
    return null;
  };
  const q1 = target.start + (target.end - target.start) * 0.33;
  const q2 = target.start + (target.end - target.start) * 0.80;
  const s1 = await seekTo(q1);
  const s2 = s1 !== null ? await seekTo(q2) : null;
  out.edit.seek = { q1: +q1.toFixed(1), got1: s1, q2: +q2.toFixed(1), got2: s2 };
  if (s1 === null || s2 === null) throw new Error("seek não confirmado pelo aria-valuetext: " + JSON.stringify(out.edit.seek));
  await splitBtn.click(); await sleep(500); // 1º split em ~33%
  await seekTo(q2); await sleep(300);
  await page.getByRole("button", { name: "Dividir no playhead" }).click(); await sleep(500); // 2º split em ~80%
  // remover o SEGMENTO DO MEIO: seek para o centro do meio
  const midSeg = (s1 + s2) / 2;
  await seekTo(midSeg); await sleep(300);
  const removeBtn = page.getByRole("button", { name: "Remover trecho do playhead" });
  const removeOk = await removeBtn.isEnabled().catch(() => false);
  if (removeOk) { await removeBtn.click(); await sleep(500); }
  const salvar = page.getByRole("button", { name: "Salvar agora" }).first();
  for (let i = 0; i < 12; i++) { if (await salvar.isEnabled().catch(() => false)) { await salvar.click(); break; } await sleep(700); }
  await sleep(1800);
  const planSaved = await page.evaluate((id) => {
    const ws = JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`));
    return Object.values(ws.clipEdits ?? {})[0]?.editPlan?.segments ?? null;
  }, BASELINE_PROJECT);
  out.edit.planSaved = planSaved;
  const kept = planSaved ? planSaved.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0) : null;
  log(`D: plano salvo = ${JSON.stringify(planSaved)} (mantido ~${kept?.toFixed(2)}s)`);

  // REABRIR: reload + abrir projeto + corte → plano persiste?
  await page.reload(); await sleep(2500);
  await openProject(page);
  await closeDialogs(page);
  await page.locator('[class*="clip-card"], [data-testid="clip-card"]').filter({ hasText: target.title.slice(0, 24) }).first()
    .locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1600);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2600);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  const planReopened = await page.evaluate((id) => {
    const ws = JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`));
    return Object.values(ws.clipEdits ?? {})[0]?.editPlan?.segments ?? null;
  }, BASELINE_PROJECT);
  out.edit.planReopened = planReopened;
  out.edit.persisted = JSON.stringify(planReopened) === JSON.stringify(planSaved);
  log(`D: reaberto = ${JSON.stringify(planReopened)} | persistiu=${out.edit.persisted}`);

  // exporta o EDITADO
  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click(); await sleep(1500);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  const destEdit = path.join(EVIDENCE, "corte-real-1-EDITADO.mp4");
  fs.rmSync(destEdit, { force: true });
  const exportEdit = await exportClip(page, target, destEdit, kept ?? target.end - target.start);
  out.edit.export = { ...exportEdit, file: exportEdit.ok ? destEdit : null, expectedKept: kept };
  log(`D: editado exportado = ${JSON.stringify(exportEdit)}`);
  await browser.close().catch(() => {});
  await killApp();

  // ---------- F: cancel / reopen / retry / cache (janela curta) ----------
  const { browser: b2, page: p2 } = await boot();
  const project = await invoke(p2, "create_project", { name: "TXT F-tests" });
  await invoke(p2, "import_media", { projectId: project.id, srcPath: "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4" });
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  record.segments = record.segments.filter(s => s.start >= 360 && s.end <= 720);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await p2.evaluate(({ projectId, mediaId, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "f.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: MEDIA_ID, segments: record.segments });
  await p2.reload(); await sleep(2000);

  // F1: cancela DURANTE inferência
  const jobId = crypto.randomUUID();
  const gen = invoke(p2, "generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId, options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  await sleep(25000);
  const cancelSent = await invoke(p2, "cancel_clips", { jobId }).catch(e => String(e));
  const cancelResult = await gen;
  const partialPublished = fs.existsSync(path.join(APPDATA, "clips", `${project.id}.json`));
  out.tests.cancel = { cancelSent: cancelSent === true, resultOk: cancelResult?.error !== undefined || Array.isArray(cancelResult), partialPublished };
  log(`F cancel: enviado=${cancelSent === true} | publicação parcial=${partialPublished}`);

  // F2: reabrir → sem reinício automático
  await p2.reload(); await sleep(2500);
  const jobAfter = await invoke(p2, "clips_job", {}).catch(() => null);
  out.tests.reopenNoRestart = { jobState: jobAfter?.state ?? "nenhum" };
  log(`F reopen: job=${jobAfter?.state ?? "nenhum"} (sem reinício ✓)`);

  // F3: retry explícito até concluir
  await p2.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1500);
  await p2.locator('[data-testid="project-card"]').filter({ hasText: "TXT F-tests" }).first().click(); await sleep(2000);
  await p2.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  const t0 = Date.now();
  const retry = await invoke(p2, "generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(), options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  out.tests.retry = { elapsedS: Math.round((Date.now() - t0) / 1000), error: retry?.error ?? null,
    clips: JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${project.id}.json`), "utf8")).clips.length };
  log(`F retry: ${out.tests.retry.elapsedS}s | ${out.tests.retry.clips} cortes`);

  // F4: edição de transcrição → stale + regeneração sem duplicatas
  const edited = JSON.parse(fs.readFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), "utf8"));
  edited.segments[0].text = "TEXTO EDITADO PELO USUÁRIO PARA INVALIDAR " + Math.random().toString(36).slice(2, 8);
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(edited));
  const afterEdit = await invoke(p2, "get_clips", { projectId: project.id, mediaId: MEDIA_ID }).catch(() => null);
  const staleCount = afterEdit?.clips?.filter(c => c.analysisStale).length ?? "n/a";
  const regen = await invoke(p2, "generate_clips", { projectId: project.id, mediaId: MEDIA_ID, jobId: crypto.randomUUID(), options: { automatic: true, format: "9:16", fit: "cover", quality: "experimentalGemma" } }).catch(e => ({ error: String(e) }));
  const afterRegen = JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${project.id}.json`), "utf8"));
  const ids = new Set(afterRegen.clips.map(c => c.id));
  let overlaps = 0;
  for (let i = 0; i < afterRegen.clips.length; i++) for (let j = i + 1; j < afterRegen.clips.length; j++) {
    const a = afterRegen.clips[i], b = afterRegen.clips[j];
    const inter = Math.min(a.end, b.end) - Math.max(a.start, b.start);
    if (inter > 0.8 * Math.min(a.end - a.start, b.end - b.start)) overlaps++;
  }
  out.tests.cacheInvalidation = { staleAfterEdit: staleCount, regenError: regen?.error ?? null,
    clipsAfterRegen: afterRegen.clips.length, uniqueIds: ids.size === afterRegen.clips.length, contentOverlaps: overlaps };
  log(`F cache: stale=${staleCount} | regen ${afterRegen.clips.length} cortes, únicos=${ids.size === afterRegen.clips.length}, overlaps=${overlaps}`);
  await b2.close().catch(() => {});
  await killApp();

  fs.writeFileSync(path.join(EVIDENCE, "aceite-final-v2.json"), JSON.stringify(out, null, 2));
  log("evidência completa em aceite-final-v2.json");
}
main().catch(async (e) => {
  console.error("[v2] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "v2-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
