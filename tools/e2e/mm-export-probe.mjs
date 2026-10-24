/** Probe de export M2: reabre projeto do lab, clica Baixar, captura erro do job. */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9386;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const EXPORT = "C:/Users/adcka/Desktop/mm-probe.mp4";

let app = null;
try {
  // perfil PRESERVADO: contém o workspace com o plano salvo
  fs.rmSync(EXPORT, { force: true });
  fs.mkdirSync(path.join(LAB, "webview"), { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: path.join(LAB, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(800);
  // re-semeia workspace do projeto (6) com o PLANO salvo (perfil foi apagado por probe anterior)
  const PROJECT_ID = "2464b51e-856b-4b6a-aec6-307c883a49f8";
  const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
  const collection = JSON.parse(fs.readFileSync(`C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/clips/${PROJECT_ID}.json`, "utf8"));
  const clipIdLocal = collection.clips[0].id;
  await page.evaluate(({ PROJECT_ID, MEDIA_ID, clipIdLocal }) => {
    const settings = { ratio: "9:16", fit: "cover", captionModel: 0, text: "", volume: 1,
      muted: false, background: "#000000", trimStart: 180, trimEnd: 210,
      editPlan: { version: 1, segments: [
        { sourceStart: 180, sourceEnd: 190.000023 },
        { sourceStart: 190.000023, sourceEnd: 196.000025 },
        { sourceStart: 204.000027, sourceEnd: 210 },
      ] } };
    const workspace = {
      version: 2,
      media: { kind: "local", name: "mm.mp4", videoId: null, url: null, width: 1920, height: 1080,
        duration: 1476.789116, mediaId: MEDIA_ID },
      transcript: [], transcriptMode: "empty",
      settings: { ...settings, editPlan: null, trimStart: 0, trimEnd: null },
      clipEdits: { [clipIdLocal]: settings },
      tool: "editor",
    };
    localStorage.setItem(`cnp.workspace.v1.${PROJECT_ID}`, JSON.stringify(workspace));
  }, { PROJECT_ID, MEDIA_ID, clipIdLocal });
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.waitForSelector('[data-testid="project-card"]', { timeout: 20000 });
  await page.locator('[data-testid="project-card"]').filter({ hasText: "MM Lab M2 (6)" }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  console.log("projeto (6) aberto com vídeo");
// escuta erros de job
  const jobErrors = [];
  await page.evaluate(() => {
    window.__jobEvents = [];
    const { listen } = window.__TAURI_INTERNALS__.event ?? {};
    if (listen) listen("clips://job", (e) => window.__jobEvents.push(e.payload));
  }).catch(() => {});
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  // clique REAL na UI (foca o app) e então invoke direto p/ erro cru
  await page.getByRole("button", { name: "Baixar", exact: true }).first().click(); await sleep(3500);
  // o ClipDownload já abriu o diálogo dele; cancela com ESC para não travar o gate
  await page.keyboard.press("Escape"); await sleep(1500);
  await page.evaluate(() => document.querySelector(".clip-download__problem .flow-button")?.click()).catch(() => {});
  await sleep(800);
  const settingsPayload = {
    ratio: "9:16", fit: "cover", captionModel: 0, text: "", volume: 1, muted: false,
    background: "#000000", trimStart: 180, trimEnd: 210,
    segments: [
      { sourceStart: 180, sourceEnd: 190.000023 },
      { sourceStart: 190.000023, sourceEnd: 196.000025 },
      { sourceStart: 204.000027, sourceEnd: 210 },
    ],
  };
  const realClipId = JSON.parse(fs.readFileSync("C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/clips/2464b51e-856b-4b6a-aec6-307c883a49f8.json","utf8")).clips[0].id;
  const exportPromise = page.evaluate(async ({ settingsPayload, realClipId }) => {
    try {
      const r = await window.__TAURI_INTERNALS__.invoke("export_video", {
        projectId: "2464b51e-856b-4b6a-aec6-307c883a49f8", mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129",
        jobId: crypto.randomUUID(), settings: settingsPayload, clipId: realClipId,
      });
      return { ok: r };
    } catch (e) { return { err: String(e) }; }
  }, { settingsPayload, realClipId });
  await sleep(4000); // diálogo nativo aberto, app focado pelo clique real
  execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${EXPORT.replace(/([()+^%~{}])/g, "{$1}")}{ENTER}')"`, { stdio: "ignore" });
  const raw = await Promise.race([exportPromise, new Promise(r => setTimeout(() => r("TIMEOUT-60s"), 60000))]);
  console.log("RESULTADO CRU:", JSON.stringify(raw));
  let exported = fs.existsSync(EXPORT);
  for (let i = 0; i < 60 && !exported; i++) { await sleep(2000); exported = fs.existsSync(EXPORT); }
  console.log("arquivo:", exported ? fs.statSync(EXPORT).size + " bytes" : "AUSENTE");
  if (exported) {
    const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${EXPORT}"`).toString().trim();
    const frames = execSync(`ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "${EXPORT}"`).toString().trim();
    console.log("ffprobe:", dur, "s,", frames, "frames");
  }
  await browser.close().catch(() => {});
} catch (e) {
  console.error("probe erro:", e.message);
} finally {
  if (app && app.exitCode === null) {
    try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
    await sleep(2000);
    if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  }
}
