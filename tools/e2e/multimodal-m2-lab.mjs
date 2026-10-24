/** MARCO 2 (goal-cortes-multimodais) — fatia vertical no TAURI REAL:
 * corte no app → plano multi-intervalo pela UI (dividir/remover/trim) →
 * undo/redo → salvar/reabrir → exportar MP4 → ffprobe == plano.
 * Mídia: vídeo real de 24 min (mesma do mantenedor, via dedupe de conteúdo).
 * O corte é SEMEADO no store (formato próprio, id sha256) para isolar o M2
 * da geração por IA (coberta no lab consolidado); transcrição não é usada
 * (legendas OFF) — declarado na evidência.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const PORT = 9386;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const PROJECT = "MM Lab M2";
const EXPORT = path.join(LAB, "mm-m2-corte.mp4");
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";

const log = (m) => console.log(`[m2] ${m}`);
const out = { steps: [] };
const check = (name, ok, detail = "") => { out.steps.push({ name, ok, detail }); log(`${ok ? "OK  " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`); };

let app = null;
function launchApp() {
  const webviewData = path.join(LAB, "webview");
  fs.mkdirSync(webviewData, { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: webviewData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1200);
}
async function waitForCdp() {
  for (let i = 0; i < 90; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) return; } } catch {}
    await sleep(500);
  }
  throw new Error("CDP indisponível");
}
const invokeOn = (page, cmd, args) => page.evaluate(async ({ cmd, args }) => {
  return await window.__TAURI_INTERNALS__.invoke(cmd, args);
}, { cmd, args });
function sendKeys(keys) {
  execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`, { stdio: "ignore" });
}
const clipId = (mediaId, start, end, format) =>
  createHash("sha256").update(`${mediaId}:${start.toFixed(3)}:${end.toFixed(3)}:${format}`).digest("hex");

async function main() {
  fs.mkdirSync(LAB, { recursive: true });
  fs.rmSync(EXPORT, { force: true });
  launchApp();
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  let page = null;
  for (let i = 0; i < 30 && !page; i++) {
    page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith("chrome-error")) ?? null;
    if (!page) await sleep(1000);
  }
  if (!page) throw new Error("nenhuma página utilizável no CDP");

  // ---- projeto + mídia (dedupe de conteúdo reaproveita o arquivo do mantenedor) ----
  const created = await invokeOn(page, "create_project", { name: PROJECT });
  const projectId = created.id;
  const rawImport = await invokeOn(page, "import_media", { projectId, srcPath: MEDIA });
  const imported = typeof rawImport === "string" ? JSON.parse(rawImport) : rawImport;
  const mediaId = imported.mediaId;
  const duration = imported.analysis.durationMs / 1000;
  log(`projeto ${projectId} | mídia ${mediaId} | ${duration.toFixed(1)}s`);
  out.env = { projectId, mediaId, duration };

  // ---- corte SEMEADO no store (formato próprio; M2 isola a edição/export) ----
  const start = 180, end = 210; // 30 s no meio do vídeo de 24 min
  const format = "9:16";
  const collection = {
    version: 1, mediaId, transcriptHash: "0".repeat(64),
    clips: [{
      id: clipId(mediaId, start, end, format), start, end,
      title: "Corte de laboratório M2", score: 70, reasons: ["seed de laboratório"],
      review: "pending", format, fit: "contain",
      analysis: null, analysisError: null, analysisSignature: null, analysisStale: null,
      deleted: null, engine: null,
    }],
  };
  fs.mkdirSync(path.join(APPDATA, "clips"), { recursive: true });
  fs.writeFileSync(path.join(APPDATA, "clips", `${projectId}.json`), JSON.stringify(collection));
  await page.evaluate(({ projectId, mediaId, name, analysis }) => {
    const workspace = {
      version: 2,
      media: { kind: "local", name, videoId: null, url: null,
        width: analysis?.width ?? null, height: analysis?.height ?? null,
        duration: analysis?.durationMs ? analysis.durationMs / 1000 : null, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 0, text: "", volume: 1,
        muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    };
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify(workspace));
  }, { projectId, mediaId, name: path.basename(MEDIA), analysis: imported.analysis });
  await page.reload(); await sleep(2500);

  // ---- abre projeto → biblioteca de cortes → editor do corte ----
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.waitForSelector('[data-testid="project-card"]', { timeout: 20000 });
  await page.locator('[data-testid="project-card"]').filter({ hasText: PROJECT }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  log("vídeo pronto (blob)");
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"], [class*="clip-card"]').first().waitFor({ timeout: 15000 });
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1500);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2500);
  await page.waitForSelector('[data-testid="video-editor"]', { timeout: 20000 });
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  await sleep(1500);
  check("corte semeado abre no editor", true);

  // seek com eventos REAIS (page.mouse): sintéticos falham em
  // setPointerCapture (pointerId inativo) e não disparam o seek do app
  const seekTo = async (t) => {
    const box = await page.locator(".timeline-surface").boundingBox();
    const x = box.x + box.width * (t / duration);
    const y = box.y + Math.min(60, box.height / 2);
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.up();
    await sleep(1200);
  };
  const readPlan = () => page.evaluate((id) => {
    const raw = localStorage.getItem(`cnp.workspace.v1.${id}`);
    return raw ? (JSON.parse(raw).clipEdits ? Object.values(JSON.parse(raw).clipEdits)[0]?.editPlan ?? null : JSON.parse(raw).settings?.editPlan ?? null) : null;
  }, projectId);
  const saveNow = async () => {
    const salvar = page.getByRole("button", { name: "Salvar agora" }).first();
    for (let i = 0; i < 10; i++) {
      if (await salvar.isEnabled().catch(() => false)) { await salvar.click(); await sleep(1200); return true; }
      await sleep(700);
    }
    return false; // captura na navegação cobre
  };

  // ---- plano pela UI: dividir → undo → redo → montagem final ----
  await seekTo(190);
  await page.getByRole("button", { name: "Dividir no playhead" }).click(); await sleep(600);
  await saveNow();
  let plan = await readPlan();
  check("dividir no playhead cria 2 segmentos e salva", plan?.segments?.length === 2 && Math.abs(plan.segments[0].sourceEnd - 190) < 0.05,
    JSON.stringify(plan?.segments));

  await page.getByRole("button", { name: /Desfazer/ }).first().click(); await sleep(600);
  await saveNow();
  plan = await readPlan();
  check("undo restaura o intervalo único", plan === null || plan?.segments?.length === 1, JSON.stringify(plan?.segments ?? null));

  await page.getByRole("button", { name: /Refazer/ }).first().click(); await sleep(600);
  await saveNow();
  plan = await readPlan();
  check("redo volta aos 2 segmentos", plan?.segments?.length === 2, JSON.stringify(plan?.segments?.length));

  await seekTo(196);
  await page.getByRole("button", { name: "Dividir no playhead" }).click(); await sleep(500);
  await seekTo(204);
  await page.getByRole("button", { name: "Dividir no playhead" }).click(); await sleep(500);
  await seekTo(199);
  await page.getByRole("button", { name: "Remover trecho do playhead" }).click(); await sleep(500);
  await saveNow();
  plan = await readPlan();
  const finalOk = plan?.segments?.length === 2
    && Math.abs(plan.segments[0].sourceStart - 180) < 0.05 && Math.abs(plan.segments[0].sourceEnd - 196) < 0.05
    && Math.abs(plan.segments[1].sourceStart - 204) < 0.05 && Math.abs(plan.segments[1].sourceEnd - 210) < 0.05;
  check("montagem final remove a pausa interna (180–196 + 204–210)", finalOk, JSON.stringify(plan?.segments));

  // ---- salvar + reabrir: plano persiste ----
  await page.reload(); await sleep(2500);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: PROJECT }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1500);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2500);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  plan = await readPlan();
  check("salvar/reabrir preserva o plano exatamente", plan?.segments?.length === 2
    && Math.abs(plan.segments[0].sourceEnd - 196) < 0.05 && Math.abs(plan.segments[1].sourceStart - 204) < 0.05,
    JSON.stringify(plan?.segments));

  // ---- reprodução composta: play salta o vão (196–204 removidos) ----
  await seekTo(195);
  await page.evaluate(() => document.querySelector(".video-surface-toggle")?.click());
  await sleep(2600);
  const playback = await page.evaluate(() => {
    const v = document.querySelector("video");
    return { t: v.currentTime, playing: !v.paused };
  });
  await page.evaluate(() => document.querySelector(".video-surface-toggle")?.click());
  await sleep(400);
  check("play salta o vão (tempo não fica em 196–204)", playback.playing && (playback.t < 196.4 || playback.t > 203.6),
    `t=${playback.t.toFixed(2)}s playing=${playback.playing}`);
  out.playbackJump = playback;

  // ---- export pelo card da biblioteca (diálogo nativo via SendKeys) ----
  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click(); await sleep(1500);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  await page.getByRole("button", { name: "Baixar", exact: true }).first().click(); await sleep(6000);
  sendKeys(EXPORT.replace(/([()+^%~{}])/g, "{$1}") + "{ENTER}");
  await sleep(2500);
  let exported = fs.existsSync(EXPORT);
  if (!exported) { // uma segunda tentativa após garantir foco no diálogo
    sendKeys(EXPORT.replace(/([()+^%~{}])/g, "{$1}") + "{ENTER}");
    await sleep(2500);
    exported = fs.existsSync(EXPORT);
  }
  for (let i = 0; i < 90 && !exported; i++) { await sleep(2000); exported = fs.existsSync(EXPORT); }
  if (!exported) {
    const notice = await page.evaluate(() => document.body.innerText.slice(0, 600));
    out.exportDiag = { notice: notice.split(String.fromCharCode(10)).join(" | ").slice(0, 400), renderTemp: fs.existsSync(path.join(APPDATA, "render-temp")) ? fs.readdirSync(path.join(APPDATA, "render-temp")).slice(0, 6) : [] };

  }
  check("MP4 exportado publicado", exported, exported ? `${(fs.statSync(EXPORT).size / 1048576).toFixed(1)} MiB` : "não apareceu");
  if (exported) {
    const dur = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${EXPORT}"`).toString().trim();
    const frames = execSync(`ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "${EXPORT}"`).toString().trim();
    const planSeconds = plan.segments.reduce((a, s) => a + (s.sourceEnd - s.sourceStart), 0);
    check("duração do MP4 == soma do plano (±0,15 s)", Math.abs(Number(dur) - planSeconds) <= 0.15, `mp4=${dur}s plano=${planSeconds.toFixed(2)}s`);
    check("frames do MP4 coerentes com CFR (~30 fps)", Number(frames) > 0 && Math.abs(Number(frames) / Number(dur) - 30) < 1.5, `${frames} frames`);
    out.export = { duration: Number(dur), frames: Number(frames), planSeconds, size: fs.statSync(EXPORT).size };
    fs.copyFileSync(EXPORT, "C:/CutNicePro/docs/reports/evidence/goal-cortes-multimodais-2026-10-23/mm-m2-corte-exemplo.mp4");
  }

  fs.writeFileSync(path.join(LAB, "m2-results.json"), JSON.stringify(out, null, 2));
  log("resultados em " + path.join(LAB, "m2-results.json"));
  await browser.close().catch(() => {});
  await killApp();
}

main().catch(async (e) => {
  console.error("[m2] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "m2-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
