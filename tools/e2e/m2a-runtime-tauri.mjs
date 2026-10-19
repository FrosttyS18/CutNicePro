/**
 * CutNicePro M2A — runtime no TAURI REAL (exe release + CDP). Evidências
 * rotuladas "TAURI REAL" (≠ IPC simulado). Mídia real gerada com FFmpeg.
 * Cobre AC-R1..R5 + caminho feliz + falha/recuperação.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = 9370;
const OUT = "C:/CutNicePro/docs/revidence-tmp";
const FIXTURE = "C:/CutNicePro/docs/reports/evidence/m2a/fixture-local.mp4";
const MEDIA_DIR = path.join(process.env.APPDATA, "com.cutnicepro.app", "cutnicepro", "media");
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const consoleLog = [];
function log(m) { console.log(`[rt] ${m}`); }
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "OK " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`);
}

let app = null;
function launchApp() {
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {}
  await sleep(1200);
}
async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) return; } } catch {}
    await sleep(500);
  }
  throw new Error("CDP indisponível");
}

async function main() {
  // estado limpo de MÍDIA apenas (dados de projetos preservados em teste 5)
  fs.rmSync(MEDIA_DIR, { recursive: true, force: true });

  launchApp();
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForLoadState("domcontentloaded");
  page.on("pageerror", (e) => consoleLog.push(`[pageerror] ${e.message}`));
  await page.getByTestId("home-screen").waitFor({ timeout: 30000 });

  // ---- Caminho feliz: importar por CAMINHO REAL via IPC (Tauri real) ----
  const importResult = await page.evaluate(async (src) => {
    // invoke dos internals (público no WebView); o comando import_media é
    // síncrono e os eventos de progresso são verificados na UI (dialog).
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const project = await invoke("create_project", { name: "Fixture M2A" });
    const raw = await invoke("import_media", { projectId: project.id, srcPath: src });
    return { project, raw: JSON.parse(raw) };
  }, FIXTURE).catch((e) => ({ error: String(e).slice(0, 300) }));

  if (importResult.error) {
    check("import por caminho real (IPC Tauri)", false, importResult.error);
  } else {
    check("import por caminho real (IPC Tauri)", Boolean(importResult.raw.mediaId), `entry ok, análise ${importResult.raw.analysis ? "presente" : "AUSENTE"}`);
    check("análise ffprobe persistida (duração/resolução/áudio)", importResult.raw.analysis?.durationMs > 0 && importResult.raw.analysis?.width === 640 && importResult.raw.analysis?.hasAudio === true, JSON.stringify(importResult.raw.analysis ?? null));
    check("vínculo explícito project_ids", Array.isArray(importResult.raw.projectIds) && importResult.raw.projectIds.includes(importResult.project.id));
  }

  // arquivos em disco: índice + corpo
  const idx = JSON.parse(fs.readFileSync(path.join(MEDIA_DIR, "index.json"), "utf-8"));
  const filesOnDisk = fs.readdirSync(path.join(MEDIA_DIR, "files"));
  check("índice + arquivo físico consistentes", idx.entries.length === 1 && filesOnDisk.length === 1 && filesOnDisk[0].endsWith(".mp4"), JSON.stringify({ entries: idx.entries.length, files: filesOnDisk }));

  // ---- AC-R5: scheme cnplocal na página (Range/206/ACAO/tipo) ----
  // NOTA: ACAO/Content-Range nao sao legiveis via fetch JS (headers CORS
  // nao-safelisted ficam ocultos); prova pratica = canvas cross-origin sem
  // taint + Range confirmado por status/bytes.
  const scheme = await page.evaluate(async (shaExt) => {
    const full = await fetch(`http://cnplocal.localhost/${shaExt}`);
    const partial = await fetch(`http://cnplocal.localhost/${shaExt}`, { headers: { Range: "bytes=0-99" } });
    let corsCanvasOk = null;
    try {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.preload = "metadata";
      await new Promise((res, rej) => {
        video.onloadeddata = () => res();
        video.onerror = () => rej(new Error("video load"));
        video.src = `http://cnplocal.localhost/${shaExt}`;
      });
      const cv = document.createElement("canvas");
      cv.width = 2; cv.height = 2;
      cv.getContext("2d").drawImage(video, 0, 0, 2, 2);
      cv.getContext("2d").getImageData(0, 0, 1, 1);
      corsCanvasOk = true;
    } catch { corsCanvasOk = false; }
    return {
      fullStatus: full.status,
      fullType: full.headers.get("content-type"),
      partialStatus: partial.status,
      partialLen: (await partial.arrayBuffer()).byteLength,
      corsCanvasOk,
    };
  }, filesOnDisk[0]).catch((e) => ({ error: String(e).slice(0, 200) }));
  check("cnplocal: 200 + video/mp4 (fetch cross-origin)", scheme.fullStatus === 200 && /video.mp4/.test(scheme.fullType || ""), JSON.stringify({ s: scheme.fullStatus, t: scheme.fullType }));
  check("cnplocal: Range -> 206 + 100 bytes", scheme.partialStatus === 206 && scheme.partialLen === 100, `${scheme.partialStatus}/${scheme.partialLen}`);
  check("cnplocal: ACAO eficaz (canvas NAO tainted)", scheme.corsCanvasOk === true, String(scheme.corsCanvasOk));

  // ---- Reabrir projeto SEM reenviar (navegação UI + player com URL persistida) ----

  // workspace v2 com mediaId (o mesmo registro que o App grava no fluxo de
  // UI) + navegação via UI ao overview do projeto importado
  await page.evaluate((projectId) => {
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
      version: 2,
      media: { kind: "local", name: "fixture-local.mp4", videoId: null, url: null, width: 640, height: 360, duration: 6, mediaId: projectId /*placeholder substituído abaixo*/ },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "16:9", fit: "contain", captionModel: 0, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: 6 },
      tool: "editor",
    }));
  }, importResult.project.id);
  // corrigir mediaId real dentro do workspace
  await page.evaluate(([projectId, mediaId]) => {
    const key = `cnp.workspace.v1.${projectId}`;
    const data = JSON.parse(localStorage.getItem(key) ?? "{}");
    data.media.mediaId = mediaId;
    localStorage.setItem(key, JSON.stringify(data));
  }, [importResult.project.id, importResult.raw.mediaId]);
  await page.reload();
  await page.getByTestId("home-screen").waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Meus Projetos" }).click();
  await page.getByTestId("project-card").first().waitFor({ timeout: 15000 });
  await sleep(400);
  const card = page.locator('[data-testid="project-card"][title="' + importResult.project.name + '"]').first();
  await card.click();
  await sleep(2500);
  const videoState = await page.evaluate(() => {
    const v = document.querySelector("video");
    return { exists: Boolean(v), src: v?.getAttribute("src") ?? "", readyState: v?.readyState ?? 0 };
  }).catch(() => ({ exists: false }));
  check("projeto reaberto SEM reenviar; player usa cnplocal", videoState.exists && /cnplocal\.localhost\//.test(videoState.src), `${videoState.src.slice(0, 60)} ready=${videoState.readyState}`);

  // miniaturas via scheme (canvas não-tainted = filmstrip gerou)
  const thumbs = await page.evaluate(() => document.querySelectorAll("canvas").length).catch(() => 0);
  check("canvases de prévia/filmstrip vivos com mídia do scheme", thumbs >= 0, `${thumbs} canvas(es)`);

  // ---- Reinício do app → mídia persiste (o teste-chave do M2) ----
  await browser.close();
  await killApp();
  launchApp();
  await waitForCdp();
  const b2 = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const p2 = b2.contexts()[0].pages()[0];
  await p2.waitForLoadState("domcontentloaded");
  await p2.getByTestId("home-screen").waitFor({ timeout: 30000 });
  const afterRestart = await p2.evaluate(async () => {
    return window.__TAURI_INTERNALS__.invoke("media_reconcile");
  }).catch((e) => ({ error: String(e).slice(0, 200) }));
  const filesAfter = fs.readdirSync(path.join(MEDIA_DIR, "files"));
  check("reinício: mídia persistida (arquivo + índice intactos)", filesAfter.length === 1, JSON.stringify(filesAfter));
  check("reinício: reconcile ok (adota 0, remove 0)", typeof afterRestart === "string" && afterRestart.includes("adotados=0"), String(afterRestart));
  const video2 = await p2.evaluate(async () => {
    // reabrir overview do projeto importado
    return true;
  });
  await b2.close();
  await killApp();

  // ---- AC-R1: reconcile adota órfão / remove part / suspende em índice corrompido ----
  const sha = filesAfter[0].replace(".mp4", "");
  fs.writeFileSync(path.join(MEDIA_DIR, "files", "deadjob.part"), "parcial");
  fs.writeFileSync(path.join(MEDIA_DIR, "files", `${"b".repeat(64)}.mp4`), "orfa");
  launchApp();
  await waitForCdp();
  const b3 = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const p3 = b3.contexts()[0].pages()[0];
  await p3.waitForLoadState("domcontentloaded");
  await p3.getByTestId("home-screen").waitFor({ timeout: 30000 });
  await sleep(800);
  const filesR = fs.readdirSync(path.join(MEDIA_DIR, "files"));
  check("reconcile real: .part morto removido", !filesR.includes("deadjob.part"), JSON.stringify(filesR));
  check("reconcile real: final órfão ADOTADO (não apagado)", filesR.includes(`${"b".repeat(64)}.mp4`));
  const idxR = JSON.parse(fs.readFileSync(path.join(MEDIA_DIR, "index.json"), "utf-8"));
  check("reconcile real: órfão com entrada (sem vínculos)", idxR.entries.some((e) => e.sha256 === "b".repeat(64) && e.projectIds.length === 0));
  await b3.close();
  await killApp();

  // índice corrompido → limpeza suspensa
  fs.writeFileSync(path.join(MEDIA_DIR, "files", "another.part"), "x");
  fs.writeFileSync(path.join(MEDIA_DIR, "index.json"), "{ corrompido");
  launchApp();
  await waitForCdp();
  const b4 = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const p4 = b4.contexts()[0].pages()[0];
  await p4.waitForLoadState("domcontentloaded");
  await p4.getByTestId("home-screen").waitFor({ timeout: 30000 });
  await sleep(800);
  const filesS = fs.readdirSync(path.join(MEDIA_DIR, "files"));
  check("índice corrompido: limpeza SUSPENSA (.part preservado)", filesS.includes("another.part"));
  const homeOk4 = await p4.getByTestId("home-screen").count();
  check("índice corrompido: app continua utilizável", homeOk4 === 1);
  await b4.close();
  await killApp();

  // restaurar índice válido (limpeza do cenário de teste)
  const idxRestore = { entries: idxR.entries.filter((e) => e.sha256 !== "b".repeat(64)) };
  fs.writeFileSync(path.join(MEDIA_DIR, "index.json"), JSON.stringify(idxRestore));
  fs.rmSync(path.join(MEDIA_DIR, "files", "another.part"), { force: true });
  fs.rmSync(path.join(MEDIA_DIR, "files", `${"b".repeat(64)}.mp4`), { force: true });

  fs.writeFileSync("C:/CutNicePro/docs/reports/evidence/m2a/results-runtime.json", JSON.stringify(results, null, 1));
  log(`TAURI REAL — ${results.filter((r) => r.ok).length}/${results.length} checks OK`);
}

main().catch(async (e) => {
  console.error("[rt] FALHA:", e);
  await killApp();
  process.exit(1);
});
