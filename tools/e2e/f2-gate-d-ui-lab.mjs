/** F2 (goal-refino) — gate D COMPLETO pela UI no exe target-refino:
 * abrir corte REAL → editar (dividir+remover com motivo) → salvar →
 * REABRIR (persiste) → Baixar PELO BOTÃO (diálogo nativo, ENTER +
 * AppActivate do PID — o padrão G3A que publicou ok:true) → MP4 real
 * conferido por ffprobe contra o plano salvo.
 * Usa o projeto "TXT Aceite Manual" (12 cortes reais, persistidos) com
 * perfil WebView PRÓPRIO para não tocar a sessão do mantenedor.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9412;
const EXE = "C:/CutNicePro/app/src-tauri/target-refino/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-refino-editorial-fluxo-local-2026-10-24";
const MANUAL_ID = fs.readFileSync(path.join(LAB, "manual-project-id.txt"), "utf8").trim();
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const DURATION = 1476.789116;
const DEFAULT_NAME = /^TXT Aceite Manual[^]*\.mp4$/i; // G7: nome agora é projeto-TÍTULO
const log = (m) => console.log(`[f2] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = {};

let app = null, appPid = null;
function launch() {
  const wv = path.join(LAB, "webview-f2");
  fs.mkdirSync(wv, { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: wv,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
  appPid = app.pid;
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 12 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1500);
}
const sendEnter = () => execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [void][Microsoft.VisualBasic.Interaction]::AppActivate(${appPid}); Start-Sleep -Milliseconds 400; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
const ffprobe = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim());

async function main() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  launch();
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));

  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(1000);
  // perfil WebView NOVO: semeia o workspace do manual (estado pós-geração)
  await page.evaluate(({ projectId, mediaId }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "manual.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: MANUAL_ID, mediaId: MEDIA_ID });
  await sleep(1500); // SEM reload: navegação SPA pelo rail (reload derruba o WebView2)
  // percurso UI real: a HOME lista projetos recentes (project-card); se o
  // manual não estiver visível, abre a seção projetos pelo cabeçalho
  for (let attempt = 0; attempt < 3; attempt++) {
    const card = page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first();
    if (await card.count()) { await card.click(); break; }
    // rail lateral: botão aria-label "Meus Projetos"
    const rail = page.locator('button[aria-label="Meus Projetos"]').first();
    if (await rail.count()) { await rail.click(); await sleep(2000); }
    else await page.evaluate(() => { const b = [...document.querySelectorAll("a,button")].find(b => /meus projetos/i.test(b.textContent)); if (b) b.click(); });
    await sleep(2000);
  }
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2000);

  // alvo: corte de maior nota
  const collection = JSON.parse(fs.readFileSync(path.join(APPDATA, "clips", `${MANUAL_ID}.json`), "utf8"));
  const target = [...collection.clips].filter(c => !c.deleted).sort((a, b) => b.score - a.score)[0];
  out.target = { title: target.title, window: [target.start, target.end], score: target.score };
  log(`alvo: ${target.title.slice(0, 45)} (${target.start.toFixed(1)}-${target.end.toFixed(1)}s)`);

  // ---------- 1. editar na timeline (dividir 33%/80% + remover o meio) ----------
  const TITLE_SNIP = target.title.slice(0, 20);
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => {}); await sleep(350); }
  await page.locator('[class*="clip-card"]').filter({ hasText: TITLE_SNIP }).first()
    .locator('[class*="clip-card__open"]').first().click(); await sleep(1800);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2800);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.readyState >= 2; }, null, { timeout: 60000 }).catch(() => {});
  const splitBtn = page.getByRole("button", { name: "Dividir no playhead" });
  await splitBtn.waitFor({ state: "visible", timeout: 20000 });
  // modo corte = botão VISÍVEL (só existe com activeClip/planEnabled). Em
  // time=0 dividir é corretamente inválido (left < 0,05s); habilita após seek.
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
  for (let i = 0; i < 15 && !(await splitBtn.isEnabled().catch(() => false)); i++) await sleep(700);
  if (!(await splitBtn.isEnabled().catch(() => false))) throw new Error("dividir desabilitado após seek 1");
  await splitBtn.click(); await sleep(500);
  const s2 = await seekTo(q2);
  if (s2 === null) throw new Error("seek 2 não confirmado");
  const splitBtn2 = page.getByRole("button", { name: "Dividir no playhead" });
  for (let i = 0; i < 15 && !(await splitBtn2.isEnabled().catch(() => false)); i++) await sleep(700);
  await splitBtn2.click(); await sleep(500);
  await seekTo((s1 + s2) / 2); await sleep(300);
  const removeBtn = page.getByRole("button", { name: "Remover trecho do playhead" });
  const removed = await removeBtn.isEnabled().catch(() => false);
  if (removed) { await removeBtn.click(); await sleep(500); }
  const salvar = page.getByRole("button", { name: "Salvar agora" }).first();
  for (let i = 0; i < 12; i++) { if (await salvar.isEnabled().catch(() => false)) { await salvar.click(); break; } await sleep(700); }
  await sleep(1800);
  const planSaved = await page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`)).clipEdits ?? {})[0]?.editPlan?.segments ?? null, MANUAL_ID);
  out.edit = { removedMiddle: removed, planSaved };
  const kept = planSaved ? planSaved.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0) : null;
  out.edit.keptSeconds = kept;
  log(`plano salvo ${JSON.stringify(planSaved)} (mantido ${kept?.toFixed(2)}s)`);

  // ---------- 2. reabrir: persistência + antigos preservados ----------
  await sleep(1500); // SEM reload: navegação SPA pelo rail (reload derruba o WebView2)
  // percurso UI real: a HOME lista projetos recentes (project-card); se o
  // manual não estiver visível, abre a seção projetos pelo cabeçalho
  for (let attempt = 0; attempt < 3; attempt++) {
    const card = page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first();
    if (await card.count()) { await card.click(); break; }
    // rail lateral: botão aria-label "Meus Projetos"
    const rail = page.locator('button[aria-label="Meus Projetos"]').first();
    if (await rail.count()) { await rail.click(); await sleep(2000); }
    else await page.evaluate(() => { const b = [...document.querySelectorAll("a,button")].find(b => /meus projetos/i.test(b.textContent)); if (b) b.click(); });
    await sleep(2000);
  }
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2000);
  await page.locator('[class*="clip-card"]').filter({ hasText: TITLE_SNIP }).first()
    .locator('[class*="clip-card__open"]').first().click(); await sleep(1800);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2800);
  const planReopened = await page.evaluate((id) => Object.values(JSON.parse(localStorage.getItem(`cnp.workspace.v1.${id}`)).clipEdits ?? {})[0]?.editPlan?.segments ?? null, MANUAL_ID);
  out.edit.persisted = JSON.stringify(planReopened) === JSON.stringify(planSaved);
  out.edit.oldClipsPreserved = (await page.evaluate(async ({ projectId, mediaId }) => await window.__TAURI_INTERNALS__.invoke("get_clips", { projectId, mediaId }), { projectId: MANUAL_ID, mediaId: MEDIA_ID }))?.clips?.length;
  log(`reaberto persistiu=${out.edit.persisted} | cortes antigos: ${out.edit.oldClipsPreserved}`);

  // ---------- 3. Baixar PELO BOTÃO (diálogo nativo) ----------
  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click(); await sleep(1600);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2000);
  for (let i = 0; i < 3; i++) { await page.keyboard.press("Escape").catch(() => {}); await sleep(350); }
  const stamp = Date.now();
  await page.locator('[class*="clip-card"]').filter({ hasText: TITLE_SNIP }).first()
    .getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(5000);
  sendEnter();
  let file = null;
  for (let i = 0; i < 90 && !file; i++) {
    await sleep(2000);
    const found = fs.readdirSync("C:/Users/adcka/Downloads")
      .map(f => ({ f, full: path.join("C:/Users/adcka/Downloads", f), at: fs.statSync(path.join("C:/Users/adcka/Downloads", f)).mtimeMs }))
      .filter(x => DEFAULT_NAME.test(x.f) && x.at > stamp).sort((a, b) => b.at - a.at);
    if (found.length) {
      const size1 = fs.statSync(found[0].full).size;
      await sleep(2500);
      if (fs.existsSync(found[0].full) && fs.statSync(found[0].full).size === size1) file = found[0].full;
    }
  }
  if (!file) throw new Error("MP4 não publicado pelo botão");
  const mp4 = ffprobe(file);
  const dest = path.join(EVIDENCE, "f2-corte-EDITADO-UI.mp4");
  fs.copyFileSync(file, dest); fs.rmSync(file);
  out.export = { file: dest, mp4Seconds: mp4, expectedKeptSeconds: kept, delta: +(mp4 - (kept ?? 0)).toFixed(2), viaButtonNativeDialog: true };
  log(`MP4 pelo botão: ${mp4}s vs plano ${kept?.toFixed(2)}s (Δ ${out.export.delta}s) → ${path.basename(dest)}`);

  fs.writeFileSync(path.join(EVIDENCE, "f2-gate-d-ui.json"), JSON.stringify(out, null, 2));
  log("evidência em f2-gate-d-ui.json");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[f2] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "f2-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
