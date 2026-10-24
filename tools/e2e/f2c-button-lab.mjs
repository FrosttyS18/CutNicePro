/** F2c (goal-refino) — fechar o critério "MP4 publicado pelo BOTÃO real":
 * CDP apenas navega até Cortes e clica Baixar → "Baixar vídeo" (rota do
 * usuário); o DIÁLOGO NATIVO é operado pelo agente via computer-use
 * (acessibilidade/UIA — injeção de input real), NÃO SendKeys. O alvo é o
 * clipe mais curto (0–17,12 s) para export rápido. Perfil WebView próprio
 * (webview-f2c) — sessão do mantenedor (PID 56308) intocada.
 */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9413;
const EXE = process.env.CNP_F2C_EXE ?? "C:/CutNicePro/app/src-tauri/target-refino/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-refino-editorial-fluxo-local-2026-10-24";
const MANUAL_ID = fs.readFileSync(path.join(LAB, "manual-project-id.txt"), "utf8").trim();
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const TITLE_SNIP = "Como identificar problemas";
const log = (m) => console.log(`[f2c] ${new Date().toISOString().slice(11, 19)} ${m}`);
const out = { startedAt: new Date().toISOString() };

const wv = path.join(LAB, "webview-f2c");
fs.rmSync(wv, { recursive: true, force: true });
fs.mkdirSync(wv, { recursive: true });
const app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
  WEBVIEW2_USER_DATA_FOLDER: wv,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
out.appPid = app.pid;
log(`exe PID ${app.pid}`);

const t0 = Date.now();
for (;;) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
  if (Date.now() - t0 > 60000) throw new Error("CDP não subiu");
  await sleep(500);
}
const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(1500);
const page = browser.contexts().flatMap(c => c.pages()).find(p => { const u = typeof p.url === "function" ? p.url() : p.url; return !String(u).startsWith("chrome-error"); });
await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
await sleep(1000);

// semear workspace do manual (perfil novo) — igual ao lab F2 validado
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
await sleep(1500);

// navegação SPA (sem reload) até o projeto
for (let attempt = 0; attempt < 3; attempt++) {
  const card = page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first();
  if (await card.count()) { await card.click(); break; }
  const rail = page.locator('button[aria-label="Meus Projetos"]').first();
  if (await rail.count()) { await rail.click(); } else {
    await page.evaluate(() => { const b = [...document.querySelectorAll("a,button")].find(b => /meus projetos/i.test(b.textContent)); if (b) b.click(); });
  }
  await sleep(2000);
}
await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2000);

// alvo: clipe mais curto (0–17,12 s), card pela rota do usuário.
// ROTA REAL: card "Baixar" → setDownloading → ClipDownload AUTO-DISPARA
// exportVideo → diálogo NATIVO abre direto (NÃO existe botão "Baixar vídeo"
// nesta rota — a espera por ele foi o bug da run anterior).
const card = page.locator('[class*="clip-card"]').filter({ hasText: TITLE_SNIP }).first();
await card.locator("button", { hasText: "Baixar" }).first().click();
out.baixarCardClicado = new Date().toISOString();
log('card "Baixar" clicado — ClipDownload dispara o diálogo nativo direto; agente assume (computer-use)');
fs.writeFileSync(path.join(EVIDENCE, "f2c-dialog-open.json"), JSON.stringify(out, null, 2));

// mantém a árvore viva 12 min p/ o agente operar o diálogo e o export rodar;
// polla o estado da UI (diálogo de processamento / resultado / erro)
for (let i = 0; i < 72; i++) {
  await sleep(10000);
  const ui = await page.evaluate(() => {
    const t = document.body.innerText || "";
    if (/Baixando clipe/.test(t)) return "processing";
    if (/Vídeo exportado/.test(t)) return "exported";
    if (/clip-download__problem|Não foi possível/.test(t)) return "problem";
    return "idle:" + (document.querySelector("[role=alert]")?.textContent?.slice(0, 60) ?? "");
  }).catch(e => "cdp-dead:" + e.message.slice(0, 40));
  if (i % 3 === 0 || ui !== "idle:") log(`UI=${ui} (${i * 10}s)`);
}
log("fim da janela de 12 min");
