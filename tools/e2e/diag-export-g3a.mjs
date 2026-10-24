/** G3A (goal-recuperacao-autoclip) — diagnóstico do erro real de
 * export/baixar: "Não foi possível processar o vídeo…". Reproduz pelo
 * caminho REAL (comando export_video + diálogo nativo + ENTER no padrão),
 * capturando a MENSAGEM BRUTA do backend (antes do clipMessage). Testa
 * davyjones (projeto real do mantenedor, 15 clipes) e TXT Aceite Manual.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9404;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23";
const log = (m) => console.log(`[diag] ${m}`);
const out = { casos: [] };

let app = null, appPid = null;
function launch() {
  const wv = path.join(LAB, "webview-diag3a");
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

  // ---- 0. corrige o vínculo de mídia do projeto manual (se faltar) ----
  const MANUAL_ID = fs.readFileSync(path.join(LAB, "manual-project-id.txt"), "utf8").trim();
  const projects = await invoke("list_projects");
  const manual = (Array.isArray(projects) ? projects : projects.projects).find(p => p.id === MANUAL_ID);
  if (manual) {
    const media = await invoke("get_media", { mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129" });
    const linked = media?.projectIds?.includes(MANUAL_ID);
    out.manualMediaLinkedBefore = linked;
    if (!linked) {
      await invoke("link_media", { mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129", projectId: MANUAL_ID });
      const after = await invoke("get_media", { mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129" });
      out.manualMediaLinkedAfter = after?.projectIds?.includes(MANUAL_ID);
      log(`vínculo manual corrigido: ${out.manualMediaLinkedAfter}`);
    } else log("vínculo manual já ok");
  }

  // ---- casos: (davyjones real) e (manual) ----
  const cases = [];
  const davy = (Array.isArray(projects) ? projects : projects.projects).find(p => p.name === "davyjones");
  if (davy) {
    const clipsFile = path.join(APPDATA, "clips", `${davy.id}.json`);
    const collection = fs.existsSync(clipsFile) ? JSON.parse(fs.readFileSync(clipsFile, "utf8")) : null;
    const mediaId = collection?.mediaId;
    const clip = collection?.clips?.filter(c => !c.deleted)[0];
    if (clip && mediaId) cases.push({ label: "davyjones", projectId: davy.id, mediaId, clip });
  }
  if (manual) {
    const clipsFile = path.join(APPDATA, "clips", `${MANUAL_ID}.json`);
    const collection = JSON.parse(fs.readFileSync(clipsFile, "utf8"));
    cases.push({ label: "aceite-manual", projectId: MANUAL_ID, mediaId: collection.mediaId, clip: collection.clips.filter(c => !c.deleted)[0] });
  }

  for (const caseItem of cases) {
    log(`== ${caseItem.label}: clipe ${caseItem.clip.start.toFixed(1)}-${caseItem.clip.end.toFixed(1)}s ==`);
    // configurações FIÉIS à UI: isolatedClipSettings + renderSettings
    // (captionStyle efetivo sempre presente quando captionModel > 0)
    const settings = {
      ratio: caseItem.clip.format ?? "9:16", fit: caseItem.clip.fit ?? "cover",
      captionModel: 2,
      captionStyle: { font: "Poppins", size: 64, weight: 600, color: "#ffffff",
        italic: false, underline: false, uppercase: false, outline: 2,
        outlineColor: "#000000", shadow: true, background: "transparent",
        highlightColor: "#02c2be", effect: "highlight", position: "bottom" },
      text: "", volume: 1, muted: false, background: "#000000",
      trimStart: caseItem.clip.start, trimEnd: caseItem.clip.end,
    };
    const exportPromise = page.evaluate(async ({ projectId, mediaId, clipId, settings }) => {
      try {
        const r = await window.__TAURI_INTERNALS__.invoke("export_video", {
          projectId, mediaId, jobId: crypto.randomUUID(), settings, clipId,
        });
        return { ok: r };
      } catch (e) { return { erroBruto: String(e) }; }
    }, { projectId: caseItem.projectId, mediaId: caseItem.mediaId, clipId: caseItem.clip.id, settings });
    await sleep(4000); // diálogo abre
    execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName Microsoft.VisualBasic; [void][Microsoft.VisualBasic.Interaction]::AppActivate(${appPid}); Start-Sleep -Milliseconds 400; Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
    const raw = await Promise.race([
      exportPromise,
      new Promise(r => setTimeout(() => r("TIMEOUT-240s"), 240000)),
    ]);
    log(`resultado: ${JSON.stringify(raw).slice(0, 220)}`);
    out.casos.push({ label: caseItem.label, clip: { start: caseItem.clip.start, end: caseItem.clip.end }, raw });
    await sleep(3000);
  }

  fs.mkdirSync(EVIDENCE, { recursive: true });
  fs.writeFileSync(path.join(EVIDENCE, "g3a-diagnostico.json"), JSON.stringify(out, null, 2));
  log("evidência em g3a-diagnostico.json");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[diag] ERRO:", e.message);
  try { fs.mkdirSync(EVIDENCE, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE, "g3a-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
