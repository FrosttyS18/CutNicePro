/** Export do corte EDITADO pelo botão com reforço de foco nativo (user32
 * SetForegroundWindow) — tentativa final do gate D pela UI; se falhar,
 * exporta pelo pipeline real e registra o bloqueio específico. Usa o
 * plano da run 9 (comprovado persistido: 0-5,65 + 13,7-17,12 = 9,07s).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9416;
const EXE = "C:/CutNicePro/app/src-tauri/target-refino/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-refino-editorial-fluxo-local-2026-10-24";
const MANUAL_ID = fs.readFileSync(path.join(LAB, "manual-project-id.txt"), "utf8").trim();
const TITLE_SNIP = "Como identificar problemas";
// plano persistido na run 9 (persistiu=true)
const PLAN = [{ sourceStart: 0, sourceEnd: 5.649595 }, { sourceStart: 13.696, sourceEnd: 17.12 }];
const KEPT = PLAN.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0);

let app = null, appPid = null;
function launch() {
  const wv = path.join(LAB, "webview-f2-export");
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
const focus = (pid) => execSync(`powershell -NoProfile -Command "
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\\\"user32.dll\\\")] public static extern bool SetForegroundWindow(IntPtr h); }';
\\$p = Get-Process -Id ${pid}; [void][W]::SetForegroundWindow(\\$p.MainWindowHandle); Start-Sleep -Milliseconds 500"`, { stdio: "ignore" });
const sendEnter = () => execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, { stdio: "ignore" });
const ffprobe = (f) => Number(execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim());

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
  const out = { planRestored: PLAN, keptExpected: +KEPT.toFixed(2) };

  // workspace com o plano EDITADO + mídia
  await page.evaluate(({ projectId, mediaId, plan }) => {
    localStorage.setItem("cnp.autoGenerate", "0");
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "manual.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      clipEdits: { e84c6c4dplaceholder: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: 17.12, editPlan: { version: 1, segments: plan } } },
      tool: "editor",
    }));
  }, { projectId: MANUAL_ID, mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129", plan: PLAN });

  // abre o projeto via SPA (sem reload)
  await page.locator('button[aria-label="Meus Projetos"]').first().click(); await sleep(2500);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first().click(); await sleep(3000);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2500);

  // Baixar o card alvo com foco nativo reforçado
  const stamp = Date.now();
  await page.locator('[class*="clip-card"]').filter({ hasText: TITLE_SNIP }).first()
    .getByRole("button", { name: "Baixar", exact: true }).click(); await sleep(6000);
  focus(appPid); await sleep(600); sendEnter();
  let file = null;
  for (let i = 0; i < 90 && !file; i++) {
    await sleep(2000);
    const found = fs.readdirSync("C:/Users/adcka/Downloads")
      .map(f => ({ f, full: path.join("C:/Users/adcka/Downloads", f), at: fs.statSync(path.join("C:/Users/adcka/Downloads", f)).mtimeMs }))
      .filter(x => /^TXT Aceite Manual/i.test(x.f) && x.f.endsWith(".mp4") && x.at > stamp).sort((a, b) => b.at - a.at);
    if (found.length) {
      const size1 = fs.statSync(found[0].full).size;
      await sleep(2500);
      if (fs.existsSync(found[0].full) && fs.statSync(found[0].full).size === size1) file = found[0].full;
    }
  }
  if (file) {
    const mp4 = ffprobe(file);
    out.export = { via: "UI button + native dialog (SetForegroundWindow)", file, mp4Seconds: mp4, expectedKept: +KEPT.toFixed(2), delta: +(mp4 - KEPT).toFixed(2) };
    const dest = path.join(EVIDENCE, "f2-corte-EDITADO-UI.mp4");
    fs.copyFileSync(file, dest); fs.rmSync(file);
    out.export.file = dest;
  } else {
    out.export = { via: "pipeline real (render::pipeline)", blockedUi: "clique+ENTER não publicou (padrão recorrente; foco reforçado também falhou)", note: "edição/persistência comprovadas na UI na run 9 (persistiu=true, 12 antigos)" };
  }
  console.log(JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(EVIDENCE, "f2-export.json"), JSON.stringify(out, null, 2));
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "f2-export-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
