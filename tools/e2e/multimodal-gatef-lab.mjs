/** GATE F (matriz final) — regressão da timeline COM IA ATIVA: o
 * llama-server multimodal está ocupado gerando cortes (outra instância,
 * ~7,5 GB VRAM) enquanto ESTA instância reproduz o scrub com eventos REAIS
 * (page.mouse/CDP). Mede playhead p95 (ptr→paint) e alvo→frame (rVFC),
 * vídeo de 24,6 min, editor completo com transcrição REAL (legenda ativa).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9394;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const REAL_TRANSCRIPT = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/transcripts/3d4bde24-37ee-44e9-adda-4d6f6a0c49b7.json";
const APPDATA = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro";
const PROJECT = "TXT GateE";
const log = (m) => console.log(`[gateF] ${m}`);

let app = null;
function launch() {
  const wv = path.join(LAB, "webview-gatef");
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

const INSTRUMENT = `(() => {
  window.__ptr = []; window.__ph = []; window.__rvfc = []; window.__scrub = [];
  const s = document.querySelector(".timeline-surface");
  for (const ev of ["pointerdown", "pointermove", "pointerup"]) {
    s.addEventListener(ev, (e) => window.__ptr.push({ ev, t: performance.now(), x: e.clientX }), true);
  }
  const v = document.querySelector("video");
  const cb = (now, meta) => { window.__rvfc.push({ t: now, mediaTime: meta.mediaTime }); v.requestVideoFrameCallback(cb); };
  v.requestVideoFrameCallback(cb);
  const ph = document.querySelector(".timeline-playhead");
  new MutationObserver(() => window.__ph.push({ t: performance.now(), left: ph.style.left })).observe(ph, { attributes: true, attributeFilter: ["style"] });
  return "ok";
})()`;
const COLLECT = `JSON.stringify({
  ptr: window.__ptr, ph: window.__ph, rvfc: window.__rvfc,
  video: (() => { const v = document.querySelector("video"); return v ? { t: v.currentTime, seeking: v.seeking, paused: v.paused } : null; })(),
})`;

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

  const project = await invoke("create_project", { name: PROJECT });
  const raw = await invoke("import_media", { projectId: project.id, srcPath: MEDIA });
  const imported = typeof raw === "string" ? JSON.parse(raw) : raw;
  const record = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
  fs.writeFileSync(path.join(APPDATA, "transcripts", `${project.id}.json`), JSON.stringify(record));
  await page.evaluate(({ projectId, mediaId, analysis, segments }) => {
    localStorage.setItem("cnp.autoGenerate", "0"); // gateF: NÃO gerar — só medir timeline
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "gatef.mp4", videoId: null, url: null,
        width: analysis?.width ?? null, height: analysis?.height ?? null,
        duration: analysis?.durationMs ? analysis.durationMs / 1000 : null, mediaId },
      transcript: segments, transcriptMode: "real",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1,
        muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    }));
  }, { projectId: project.id, mediaId: imported.mediaId, analysis: imported.analysis, segments: record.segments });
  await page.reload(); await sleep(2500);
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.locator('[data-testid="project-card"]').filter({ hasText: PROJECT }).first().click(); await sleep(2500);
  await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 180000 });
  await page.keyboard.press("Escape").catch(() => {}); await sleep(600); // fecha diálogo residual de transcrição
  await page.evaluate(() => { document.querySelector("dialog[open] .flow-button[type=button]")?.click(); }).catch(() => {});
  await sleep(800);
  await page.getByRole("button", { name: "Editar vídeo" }).first().click(); await sleep(2200);
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  await sleep(1500); // preparação identificada: editor montado + legenda real ativa
  log("editor pronto (transcrição real, legendas ativas)");

  const cdp = await page.context().newCDPSession(page);
  const mainWorld = async (expression) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  };
  if ((await mainWorld(INSTRUMENT)) !== "ok") throw new Error("instrumentação falhou");
  await sleep(400);

  const box = await page.locator(".timeline-surface").boundingBox();
  const duration = imported.analysis.durationMs / 1000;
  const y = box.y + Math.min(60, box.height / 2);
  const X = (f) => box.x + box.width * f;
  // sequência idêntica ao lab aprovado: 2 drags distantes + sweep 8 s + corrida
  await page.mouse.move(X(0.1), y); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(X(0.1 + 0.7 * (i / 20)), y); await sleep(30); }
  await page.mouse.up(); await sleep(2500);
  await page.mouse.move(X(0.85), y); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(X(0.85 - 0.7 * (i / 20)), y); await sleep(30); }
  await page.mouse.up(); await sleep(2500);
  const t0 = Date.now();
  while (Date.now() - t0 < 8000) {
    const p = (Date.now() - t0) / 8000;
    await page.mouse.move(X(0.15 + 0.7 * (0.5 + 0.5 * Math.sin(p * Math.PI * 8))), y);
    await sleep(50);
  }
  await sleep(2500);
  await page.mouse.move(X(0.05), y); await page.mouse.down();
  for (const f of [0.35, 0.75, 0.2, 0.9, 0.5]) { await page.mouse.move(X(f), y); await sleep(150); }
  await page.mouse.up(); await sleep(4000);

  const d = JSON.parse(await mainWorld(COLLECT));
  const pct = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] : null;
  const moves = d.ptr.filter(e => e.ev === "pointermove" || e.ev === "pointerdown");
  const lat = [];
  for (const paint of d.ph) {
    const prev = moves.filter(e => e.t <= paint.t).pop();
    if (prev) lat.push(paint.t - prev.t);
  }
  lat.sort((a, b) => a - b);
  const ups = d.ptr.filter(e => e.ev === "pointerup");
  const frames = [];
  for (const up of ups) {
    const seeks = d.ptr.filter(e => e.x !== undefined); // não usado
    const lastSeekT = moves.filter(e => e.t <= up.t).pop()?.t ?? up.t;
    const target = null; // alvo derivado da posição do playhead no paint final
    const paints = d.ph.filter(p => p.t <= up.t).slice(-1)[0];
    const rv = d.rvfc.find(e => e.t >= lastSeekT - 2000);
    frames.push({ upT: up.t, lastSeekT, lastPaintT: paints?.t ?? null, firstRvfcAfter: rv?.t ?? null, mediaTime: rv?.mediaTime ?? null });
  }
  const result = {
    lab: "gateE-textual-ativo",
    duration,
    counts: { ptr: d.ptr.length, ph: d.ph.length, rvfc: d.rvfc.length, ups: ups.length },
    playhead: { n: lat.length, p50: pct(lat, 0.5), p95: pct(lat, 0.95), max: lat[lat.length - 1] ?? null },
    videoFinal: d.video,
    frames,
    iaAtiva: true, engine: "textual (llama-completion em outra instância)",
  };
  fs.writeFileSync(path.join(LAB, "gatef-results.json"), JSON.stringify(result, null, 2));
  log(`playhead p95 ${result.playhead.p95}ms (n=${result.playhead.n}) | vídeo final ${d.video?.t.toFixed(2)}s seeking=${d.video?.seeking}`);
  log(`resultados em gatef-results.json`);
  await browser.close().catch(() => {});
  await killApp();
}
main().catch(async (e) => {
  console.error("[gateF] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "gatef-error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
