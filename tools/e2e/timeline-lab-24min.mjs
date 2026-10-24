/** Timeline lab 2026-10-22 (v2) — scrub real com vídeo de 24 min (1476s, 329MB)
 * no Tauri (target-upd20, dev server 1420 = working tree). Mede:
 *  - playhead: pointermove → paint do .timeline-playhead (p95)
 *  - frame: alvo final do drag → overlay commit (WebCodecs) ou videoSeeked (<video>)
 *  - snapback: após soltar, video.currentTime == último alvo
 *  - long tasks, heap JS, memória de processo (PowerShell)
 * Braços: OFF (overlay desativado = baseline) e ON (candidata FrameSeeker),
 * mesma sequência/sessão. v2: instrumentação NO MUNDO PRINCIPAL via sessão CDP
 * (page.evaluate do Playwright roda em mundo isolado — window.__scrubLog não
 * cruzava mundos na v1) e reuso do projeto lab (evita recopiar 329MB).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");

const PORT = 9385;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/timeline-lab";
const MEDIA = "C:/Users/adcka/Downloads/YTDown.com_YouTube_Media_A9OXOqvRxeE_Portfolio-de-UX-em-2026-Estrutura-Básica-Que-Funciona_001_1080p.mp4";
const PROJECT = "Timeline Lab 24min";
// Transcrição REAL do projeto do mantenedor (568 segs, whisper-large-v3-turbo):
// usada SOMENTE LEITURA para semear o workspace do lab (cópia), nunca gravada.
const REAL_TRANSCRIPT = "C:/Users/adcka/AppData/Roaming/com.cutnicepro.app/cutnicepro/transcripts/3d4bde24-37ee-44e9-adda-4d6f-0c49b7.json";

const log = (m) => console.log(`[lab] ${m}`);
const out = { arms: [], env: { media: MEDIA, exe: EXE, port: PORT } };

function procMemMB() {
  try {
    const s = execSync(
      `powershell -NoProfile -Command "(Get-Process cutnicepro,msedgewebview2 -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum/1MB"`,
      { encoding: "utf8" });
    return Math.round(parseFloat(s.trim()));
  } catch { return -1; }
}

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

// executa no MUNDO PRINCIPAL (mesmo contexto do React/app)
async function mainWorld(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("mainWorld: " + JSON.stringify(r.exceptionDetails.exception?.description ?? r.exceptionDetails).slice(0, 300));
  return r.result?.value;
}

const INSTRUMENT = `(() => {
  window.__scrubLog = []; window.__ptr = []; window.__rvfc = []; window.__phPaint = []; window.__longTasks = []; window.__heap = [];
  const surface = document.querySelector(".timeline-surface");
  if (!surface) return "no-surface";
  for (const ev of ["pointerdown", "pointermove", "pointerup"]) {
    surface.addEventListener(ev, (e) => window.__ptr.push({ ev, t: performance.now(), x: e.clientX }), true);
  }
  const video = document.querySelector("video");
  const cb = (now, meta) => { window.__rvfc.push({ t: now, mediaTime: meta.mediaTime }); video.requestVideoFrameCallback(cb); };
  video.requestVideoFrameCallback(cb);
  const ph = document.querySelector(".timeline-playhead");
  new MutationObserver(() => window.__phPaint.push({ t: performance.now(), left: ph.style.left }))
    .observe(ph, { attributes: true, attributeFilter: ["style"] });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push({ t: e.startTime, d: e.duration }); })
    .observe({ entryTypes: ["longtask"] });
  setInterval(() => window.__heap.push({ t: performance.now(), mb: (performance.memory && performance.memory.usedJSHeapSize || 0) / 1048576 }), 500);
  return "ok:" + (window.__ptr === window.__ptr);
})()`;

const COLLECT = `JSON.stringify((() => {
  const mem = window.__heap || [];
  const peak = mem.length ? Math.max(...mem.map(s => s.mb)) : 0;
  const last = mem.length ? mem[mem.length - 1].mb : 0;
  const v = document.querySelector("video");
  return {
    ptr: window.__ptr || [], phPaint: window.__phPaint || [], scrub: window.__scrubLog || [],
    rvfc: window.__rvfc || [], longTasks: window.__longTasks || [],
    heap: { peakMB: +peak.toFixed(1), lastMB: +last.toFixed(1), samples: mem.length },
    videoState: v ? { currentTime: v.currentTime, seeking: v.seeking, paused: v.paused, readyState: v.readyState } : null,
    overlayPresent: Boolean(document.querySelector(".workspace-preview__scrub")),
  };
})())`;

const RESET = `window.__scrubLog = []; window.__ptr = []; window.__rvfc = []; window.__phPaint = []; window.__longTasks = []; window.__heap = []; "reset"`;

async function scrubSequence(page, clockOffsetMs) {
  const surface = await page.locator(".timeline-surface").boundingBox();
  if (!surface) throw new Error("timeline-surface ausente");
  const y = surface.y + Math.min(60, surface.height / 2);
  const X = (f) => surface.x + surface.width * f;
  const marks = [];
  const pageT = () => Date.now() - clockOffsetMs;

  // 1) drag distante A→B (10% → 80%)
  await page.mouse.move(X(0.1), y); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(X(0.1 + 0.7 * (i / 20)), y); await sleep(30); }
  await page.mouse.up(); marks.push({ endPageT: pageT(), label: "drag-A" }); await sleep(2500);

  // 2) drag distante reverso (85% → 15%)
  await page.mouse.move(X(0.85), y); await page.mouse.down();
  for (let i = 1; i <= 20; i++) { await page.mouse.move(X(0.85 - 0.7 * (i / 20)), y); await sleep(30); }
  await page.mouse.up(); marks.push({ endPageT: pageT(), label: "drag-B" }); await sleep(2500);

  // 3) sweep sinusoidal 8s (botão pressionado — arrasto contínuo)
  const t0 = Date.now();
  await page.mouse.move(X(0.5), y); await page.mouse.down();
  while (Date.now() - t0 < 8000) {
    const p = (Date.now() - t0) / 8000;
    await page.mouse.move(X(0.15 + 0.7 * (0.5 + 0.5 * Math.sin(p * Math.PI * 8))), y);
    await sleep(50);
  }
  await page.mouse.up(); marks.push({ endPageT: pageT(), label: "sweep" }); await sleep(2500);

  // 4) corrida: 5 saltos rápidos, último alvo vence
  await page.mouse.move(X(0.05), y); await page.mouse.down();
  const stops = [0.35, 0.75, 0.2, 0.9, 0.5];
  for (const f of stops) { await page.mouse.move(X(f), y); await sleep(150); }
  await page.mouse.up(); marks.push({ endPageT: pageT(), label: "race" });
  await sleep(4000); // settle: último alvo precisa estar no <video>
  return marks;
}

function analyze(armName, d, seqMarks = []) {
  // seqMarks: [{startPageT, endPageT, label}] em relógio da página (via offset)
  const ptrMoves = d.ptr.filter(e => e.ev === "pointermove" || e.ev === "pointerdown");
  const phLat = [];
  for (const paint of d.phPaint) {
    const prev = ptrMoves.filter(e => e.t <= paint.t).pop();
    if (prev) phLat.push(paint.t - prev.t);
  }
  phLat.sort((a, b) => a - b);
  const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null;

  // drags: por pointerup; se ausente, usa marcas da sequência (relógio da página)
  const ups = d.ptr.filter(e => e.ev === "pointerup").map(e => ({ t: e.t }));
  const dragEnds = ups.length >= 4 ? ups : seqMarks.map(m => ({ t: m.endPageT, label: m.label }));
  const frames = [];
  for (const up of dragEnds) {
    const seeks = d.scrub.filter(e => e.ev === "seek" && e.t <= up.t);
    if (!seeks.length) continue;
    const lastSeek = seeks[seeks.length - 1];
    const target = lastSeek.target;
    const ov = d.scrub.find(e => e.ev === "overlay" && Math.abs(e.target - target) < 0.001 && e.t > up.t - 3000 && e.t <= up.t + 6000);
    const vs = d.scrub.find(e => e.ev === "videoSeeked" && Math.abs(e.time - target) < 0.08 && e.t >= lastSeek.t);
    const rv = d.rvfc.find(e => Math.abs(e.mediaTime - target) < 0.08 && e.t >= lastSeek.t);
    frames.push({ target: +target.toFixed(2), upT: +up.t.toFixed(0), label: up.label ?? null, lastSeekT: +lastSeek.t.toFixed(0),
      overlayMs: ov ? +(ov.t - up.t).toFixed(1) : null,
      overlayFromSeekMs: ov ? +(ov.t - lastSeek.t).toFixed(1) : null,
      videoSeekedMs: vs ? +(vs.t - up.t).toFixed(1) : null,
      videoFromSeekMs: vs ? +(vs.t - lastSeek.t).toFixed(1) : null,
      rvfcMs: rv ? +(rv.t - up.t).toFixed(1) : null });
  }
  const lt = d.longTasks;
  return {
    arm: armName,
    counts: { ptr: d.ptr.length, phPaint: d.phPaint.length, scrub: d.scrub.length, rvfc: d.rvfc.length, ups: ups.length },
    playhead: { n: phLat.length, p50: pct(phLat, 0.5), p95: pct(phLat, 0.95), max: phLat[phLat.length - 1] ?? null },
    frames,
    frameOverlayP95: pct(frames.filter(f => f.overlayMs !== null).map(f => f.overlayMs).sort((a, b) => a - b), 0.95),
    frameVideoP95: pct(frames.filter(f => f.videoSeekedMs !== null).map(f => f.videoSeekedMs).sort((a, b) => a - b), 0.95),
    longTasks: { count: lt.length, totalMs: +lt.reduce((a, e) => a + e.d, 0).toFixed(0), maxMs: lt.length ? +Math.max(...lt.map(e => e.d)).toFixed(0) : 0 },
    heap: d.heap,
    videoState: d.videoState,
    overlayPresentAtEnd: d.overlayPresent,
    raw: { ptr: d.ptr, phPaint: d.phPaint, scrub: d.scrub, rvfc: d.rvfc, longTasks: d.longTasks },
  };
}

async function main() {
  fs.mkdirSync(LAB, { recursive: true });
  launchApp();
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
  log("página: " + page.url());
  const cdp = await page.context().newCDPSession(page);

  // ---- projeto: reusa o existente ou cria+importa ----
  const projects = await invokeOn(page, "list_projects");
  const existing = (projects ?? []).filter(p => p.name === PROJECT).sort((a, b) => String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")));
  let projectId = null, mediaId = null, durationS = null, w = null, h = null;
  if (existing.length) {
    projectId = existing[0].id;
    const wsRaw = await page.evaluate((id) => localStorage.getItem(`cnp.workspace.v1.${id}`), projectId);
    const ws = wsRaw ? JSON.parse(wsRaw) : null;
    mediaId = ws?.media?.mediaId ?? null;
    durationS = ws?.media?.duration ?? null;
    w = ws?.media?.width ?? null; h = ws?.media?.height ?? null;
    log(`reusando projeto ${projectId} (mediaId ${mediaId})`);
  }
  if (!projectId || !mediaId) {
    const created = await invokeOn(page, "create_project", { name: PROJECT });
    if (!created?.id) throw new Error("create_project falhou");
    projectId = created.id;
    const tImp0 = Date.now();
    const rawImport = await invokeOn(page, "import_media", { projectId, srcPath: MEDIA });
    const imported = typeof rawImport === "string" ? JSON.parse(rawImport) : rawImport;
    if (!imported?.mediaId) throw new Error("import_media falhou: " + JSON.stringify(imported).slice(0, 200));
    mediaId = imported.mediaId;
    durationS = imported.analysis?.durationMs ? imported.analysis.durationMs / 1000 : null;
    w = imported.analysis?.width ?? null; h = imported.analysis?.height ?? null;
    log(`mídia importada em ${Date.now() - tImp0}ms — mediaId ${mediaId}`);
    out.import = { ms: Date.now() - tImp0, mediaId };
    await page.evaluate(({ projectId, mediaId, name, analysis }) => {
      const workspace = {
        version: 2,
        media: { kind: "local", name, videoId: null, url: null,
          width: analysis?.width ?? null, height: analysis?.height ?? null,
          duration: analysis?.durationMs ? analysis.durationMs / 1000 : null, mediaId },
        transcript: [], transcriptMode: "empty",
        settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1,
          muted: false, background: "#000000", trimStart: 0, trimEnd: null },
        tool: "editor",
      };
      localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify(workspace));
    }, { projectId, mediaId, name: path.basename(MEDIA), analysis: { width: w, height: h, durationMs: durationS * 1000 } });
  }
  out.media = { projectId, mediaId, durationS, w, h };
  // ---- transcrição: REAL (568 segs do projeto do mantenedor, somente
  // leitura, semeada como cópia no workspace do lab) ou sintética de fallback ----
  const tSeed0 = Date.now();
  let realSegments = null;
  try {
    const rt = JSON.parse(fs.readFileSync(REAL_TRANSCRIPT, "utf8"));
    if (Array.isArray(rt.segments) && rt.segments.length > 100) realSegments = rt.segments;
  } catch { /* fallback sintético */ }
  await page.evaluate(({ projectId, durationS, realSegments }) => {
    const key = `cnp.workspace.v1.${projectId}`;
    const ws = JSON.parse(localStorage.getItem(key) || "null");
    if (!ws) throw new Error("workspace ausente");
    let segs;
    if (realSegments) {
      segs = realSegments; // cópia real, somente leitura
    } else {
      segs = [];
      for (let i = 0; i * 5 < durationS; i++) {
        const s = i * 5, e = Math.min(durationS, (i + 1) * 5);
        const words = [];
        let t = s;
        for (let wI = 0; wI < 5 && t < e; wI++) {
          const wEnd = Math.min(e, t + (e - s) / 5);
          words.push({ text: `sintético${i}-${wI}`, start: +t.toFixed(2), end: +wEnd.toFixed(2) });
          t = wEnd;
        }
        segs.push({ id: `syn-${i}`, start: +s.toFixed(2), end: +e.toFixed(2),
          text: `Segmento sintético ${i} para custo de render da timeline.`, words });
      }
    }
    ws.transcript = segs;
    ws.transcriptMode = "real";
    localStorage.setItem(key, JSON.stringify(ws));
  }, { projectId, durationS: durationS ?? 1476.79, realSegments });
  log(`transcrição ${realSegments ? "REAL (" + realSegments.length + " segs, somente leitura)" : "SINTÉTICA (fallback)"} semeada em ${Date.now() - tSeed0}ms`);
  out.transcriptSource = realSegments ? { kind: "real", segments: realSegments.length, words: realSegments.reduce((a, s) => a + (s.words?.length ?? 0), 0) } : { kind: "synthetic" };
  await page.reload(); await sleep(2500);

  // ---- abre o projeto e vai ao editor ----
  await page.waitForSelector(".splash", { state: "detached", timeout: 60000 }).catch(() => {});
  await sleep(1000);
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1800);
  await page.waitForSelector('[data-testid="project-card"]', { timeout: 20000 });
  await page.locator('[data-testid="project-card"]').filter({ hasText: PROJECT }).first().click(); await sleep(2500);
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.src.startsWith("blob:") && v.readyState >= 1;
  }, null, { timeout: 180000 });
  log("vídeo pronto (blob), duration " + await page.evaluate(() => document.querySelector("video").duration));
  await page.getByRole("button", { name: "Editar vídeo" }).first().click(); await sleep(2000);
  await page.waitForSelector('[data-testid="video-editor"]', { timeout: 20000 });
  await page.waitForSelector(".timeline-surface", { timeout: 20000 });
  await sleep(1500); // preparação identificada: editor montado, vídeo idle

  const inst = await mainWorld(cdp, INSTRUMENT);
  if (inst !== "ok:true") throw new Error("instrumentação falhou: " + inst);
  await mainWorld(cdp, `window.__DISABLE_OVERLAY = true; "flag-off"`);
  await sleep(500);
  out.memAfterLoad = procMemMB();
  // ponte de relógio: page performance.now() = Date.now() - offset
  const clockOffset = await mainWorld(cdp, `Date.now() - performance.now()`);
  log("instrumentação OK (mundo principal); memória após carga: " + out.memAfterLoad + "MB");

  // ---- BRAÇO OFF: baseline (overlay desativado; blob + seek coalescido) ----
  log("braço OFF: sequência de scrub…");
  const tOff0 = Date.now();
  const marksOff = await scrubSequence(page, clockOffset);
  const off = analyze("OFF", JSON.parse(await mainWorld(cdp, COLLECT)), marksOff);
  off.procMemMB = procMemMB();
  out.arms.push(off);
  log(`OFF (${Date.now() - tOff0}ms): counts ${JSON.stringify(off.counts)} | playhead p95 ${off.playhead.p95}ms (n=${off.playhead.n}) | frame(video) p95 ${off.frameVideoP95}ms | LT ${off.longTasks.count}/${off.longTasks.totalMs}ms | heap peak ${off.heap.peakMB}MB | proc ${off.procMemMB}MB`);
  log("OFF frames: " + JSON.stringify(off.frames));
  await sleep(2000);

  // ---- BRAÇO ON (candidata: FrameSeeker/WebCodecs) — 2 passes ----
  for (const pass of [1, 2]) {
    await mainWorld(cdp, RESET);
    await mainWorld(cdp, `window.__DISABLE_OVERLAY = false; "flag-on"`);
    await sleep(800);
    log(`braço ON (passada ${pass})…`);
    const tOn0 = Date.now();
    const marksOn = await scrubSequence(page, clockOffset);
    const on = analyze(`ON-${pass}`, JSON.parse(await mainWorld(cdp, COLLECT)), marksOn);
    on.procMemMB = procMemMB();
    out.arms.push(on);
    log(`ON-${pass} (${Date.now() - tOn0}ms): counts ${JSON.stringify(on.counts)} | playhead p95 ${on.playhead.p95}ms (n=${on.playhead.n}) | overlay p95 ${on.frameOverlayP95}ms | frame(video) p95 ${on.frameVideoP95}ms | LT ${on.longTasks.count}/${on.longTasks.totalMs}ms | heap peak ${on.heap.peakMB}MB | proc ${on.procMemMB}MB`);
    log(`ON-${pass} frames: ` + JSON.stringify(on.frames));
    await sleep(1500);
  }

  // ---- playhead SEM hop do harness: PointerEvents sintéticos no mundo
  // principal (mesmo caminho React/rAF/render; sem despacho CDP) e paint
  // detectado por double-rAF. Um sweep OFF e um ON (mesma trajetória). ----
  const SYN_SWEEP = `(async () => {
    const surface = document.querySelector(".timeline-surface");
    const r = surface.getBoundingClientRect();
    const y = r.top + Math.min(60, r.height / 2);
    window.__syn = [];
    const disp = (type, x, buttons) => surface.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: "mouse", isPrimary: true, buttons,
      clientX: x, clientY: y, bubbles: true, cancelable: true }));
    disp("pointerdown", r.left + r.width * 0.5, 1);
    for (let i = 0; i <= 240; i++) {
      const f = 0.15 + 0.7 * (0.5 + 0.5 * Math.sin((i / 240) * Math.PI * 8));
      const x = r.left + r.width * f;
      const t0 = performance.now();
      disp("pointermove", x, 1);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      window.__syn.push({ t0, tPaint: performance.now() });
      await new Promise((res) => setTimeout(res, 20));
    }
    disp("pointerup", r.left + r.width * 0.5, 0);
    return window.__syn.length;
  })()`;
  out.syn = [];
  for (const arm of ["OFF", "ON"]) {
    await mainWorld(cdp, `window.__DISABLE_OVERLAY = ${arm === "OFF" ? "true" : "false"}; "syn-flag"`);
    await sleep(700);
    const n = await mainWorld(cdp, `${SYN_SWEEP}.then(n => "syn:" + n)`);
    const lat = await mainWorld(cdp, `JSON.stringify(window.__syn.map(e => +(e.tPaint - e.t0).toFixed(1)))`);
    const arr = JSON.parse(lat).sort((a, b) => a - b);
    const pct = (p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null;
    out.syn.push({ arm, n: arr.length, p50: pct(0.5), p95: pct(0.95), max: arr[arr.length - 1] ?? null });
    log(`syn-${arm}: n=${arr.length} playhead p50 ${pct(0.5)}ms p95 ${pct(0.95)}ms max ${arr[arr.length - 1]}ms (sem hop CDP)`);
    await sleep(1500);
  }

  // ---- regressão de playback ----
  const play = await page.evaluate(() => {
    document.querySelector(".video-surface-toggle")?.click();
    return new Promise((resolve) => setTimeout(() => {
      const v = document.querySelector("video");
      resolve({ playing: !v.paused, t1: v.currentTime, overlay: Boolean(document.querySelector(".workspace-preview__scrub")) });
    }, 1200));
  });
  const play2 = await page.evaluate(() => new Promise((resolve) => {
    const v = document.querySelector("video");
    setTimeout(() => resolve({ t2: v.currentTime, stillPlaying: !v.paused, overlay2: Boolean(document.querySelector(".workspace-preview__scrub")) }), 1500);
  }));
  out.playback = { ...play, ...play2, advanced: play2.t2 > play.t1 + 0.3, overlayHiddenWhilePlaying: !play.overlay && !play2.overlay2 };
  log("playback após scrub: " + JSON.stringify(out.playback));
  await page.evaluate(() => document.querySelector(".video-surface-toggle")?.click());
  await sleep(600);
  out.memEnd = procMemMB();
  log("memória no fim: " + out.memEnd + "MB");

  fs.writeFileSync(path.join(LAB, "results.json"), JSON.stringify(out, null, 2));
  log("resultados em " + path.join(LAB, "results.json"));
  await browser.close().catch(() => {});
  await killApp();
}

main().catch(async (e) => {
  console.error("[lab] ERRO:", e.message);
  try { fs.writeFileSync(path.join(LAB, "error.txt"), String(e.stack ?? e)); } catch {}
  await killApp();
  process.exit(1);
});
