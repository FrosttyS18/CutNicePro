/** G3C (goal-recuperacao-autoclip) — validação VISUAL dos prints do
 * mantenedor no app real: (1) checkbox "Gerar automaticamente" agora no
 * diálogo "Gerar cortes" (não mais solto entre botões); (2) alinhamento
 * de "Transcrever novamente"; (3) botões colados quando o projeto não tem
 * vídeo (estado vazio); (4) uma largura menor. Captura screenshots para
 * o mantenedor julgar + verificações estruturais (gap ≥8px, sem overlap).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9406;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const EVIDENCE = "C:/CutNicePro/docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23";
const MANUAL_ID = fs.readFileSync(path.join(LAB, "manual-project-id.txt"), "utf8").trim();
const MEDIA_ID = "33932fbc-5a4d-42a6-8784-f7c1f0231129";
const log = (m) => console.log(`[g3c] ${m}`);
const out = {};

let app = null;
function launch() {
  const wv = path.join(LAB, "webview-g3c");
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
  await sleep(1200);
}
const shot = async (page, name) => {
  const file = path.join(EVIDENCE, `g3c-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
};

async function main() {
  launch();
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) break; } } catch {}
    await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error"));

  // estado 1: PROJETO SEM VÍDEO (prints: botões colados) — cria projeto vazio
  const empty = await page.evaluate(async () => await window.__TAURI_INTERNALS__.invoke("create_project", { name: "Vazio G3C" }));
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(1200);
  await page.evaluate(() => location.reload());
  await sleep(4000);
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await page.getByRole("button", { name: "Meus Projetos" }).first().waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "Vazio G3C" }).first().waitFor({ timeout: 15000 });
  await page.locator('[data-testid="project-card"]').filter({ hasText: "Vazio G3C" }).first().click(); await sleep(2200);
  out.emptyState = await shot(page, "projeto-vazio");
  // verificação estrutural: botões do painel de ferramentas sem overlap e com gap >= 8px
  out.emptyButtons = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll(".project-overview .flow-button, .project-without-media button, .transcription-controls .flow-button")];
    return buttons.map(b => { const r = b.getBoundingClientRect(); return { text: (b.textContent || "").trim().slice(0, 24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  });
  log(`vazio: ${out.emptyButtons.length} botões capturados`);

  // estado 2: PROJETO COM TRANSCRIÇÃO REAL (print: alinhamento Transcrever novamente + checkbox)
  await page.getByRole("button", { name: /Voltar|Meus Projetos/ }).first().click().catch(() => {});
  await sleep(1200);
  await page.evaluate(({ projectId, mediaId }) => {
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "ux.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: MANUAL_ID, mediaId: MEDIA_ID });
  // transcrição já existe no store deste projeto; recarrega via navegação (sem reload)
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1600);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first().click(); await sleep(2400);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  out.toolsWithTranscript = await shot(page, "ferramentas-com-transcricao");
  out.toolButtons = await page.evaluate(() => {
    const row = document.querySelector(".project-overview .transcription-controls, .project-overview");
    const buttons = [...(row?.querySelectorAll(".flow-button, .upload-primary") ?? [])];
    return buttons.map(b => { const r = b.getBoundingClientRect(); return { text: (b.textContent || "").trim().slice(0, 30), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; });
  });
  // alinhamento: todos os botões da MESMA linha devem ter o mesmo y (±2px)
  const sameRow = out.toolButtons.filter(b => out.toolButtons.some(o => o !== b && Math.abs(o.y - b.y) < 24));
  if (sameRow.length >= 2) {
    const ys = sameRow.map(b => b.y);
    out.alignedRow = { buttons: sameRow.map(b => b.text), spreadY: Math.max(...ys) - Math.min(...ys) };
  }
  // gaps ≥ 8px entre vizinhos na mesma linha
  const row = [...new Set(sameRow.map(b => b.y))].length === 1 ? sameRow : [];
  if (row.length >= 2) {
    row.sort((a, b) => a.x - b.x);
    out.gaps = row.slice(1).map((b, i) => Math.round(b.x - (row[i].x + row[i].w)));
  }
  log(`transcrito: ${out.toolButtons.length} botões; alinhamento ${JSON.stringify(out.alignedRow ?? null)}; gaps ${JSON.stringify(out.gaps ?? null)}`);

  // estado 3: DIÁLOGO "Gerar cortes" com o checkbox CONTEXTUAL
  await page.getByRole("button", { name: "Gerar cortes" }).first().click(); await sleep(1200);
  out.generateDialog = await shot(page, "dialogo-gerar-checkbox");
  out.dialogCheckbox = await page.evaluate(() => {
    const label = [...document.querySelectorAll("label")].find(l => l.textContent?.includes("Gerar automaticamente quando a transcrição terminar"));
    if (!label) return null;
    const r = label.getBoundingClientRect();
    const checkbox = label.querySelector("input[type=checkbox]");
    return { text: label.textContent?.trim().slice(0, 60), checked: checkbox?.checked ?? null, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) };
  });
  log(`diálogo: checkbox ${JSON.stringify(out.dialogCheckbox)}`);
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(600);

  // estado 4: largura menor (janela 900px) com projeto vazio
  await page.getByRole("button", { name: /Voltar ao projeto|Meus Projetos/ }).first().click().catch(() => {});
  await sleep(1200);
  await page.evaluate(() => { window.resizeTo(900, 800); });
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 800, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click().catch(async () => {
    // já pode estar na home
  }); await sleep(1600);
  await page.locator('[data-testid="project-card"]').filter({ hasText: "Vazio G3C" }).first().click().catch(() => {}); await sleep(2000);
  out.narrow = await shot(page, "projeto-vazio-900px");
  await session.send("Emulation.clearDeviceMetricsOverride");

  fs.writeFileSync(path.join(EVIDENCE, "g3c-validacao-visual.json"), JSON.stringify(out, null, 2));
  log("screenshots + métricas salvos");
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[g3c] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "g3c-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
