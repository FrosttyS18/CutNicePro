/** Cleanup: remove projetos "Timeline Lab 24min" criados pelo lab (e cópias de mídia). */
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

let app = null;
try {
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: path.join(LAB, "webview"),
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); ok = t.some(x => x.type === "page"); } } catch {}
    if (!ok) await sleep(500);
  }
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(1500);
  const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
  const projects = await page.evaluate(async () => await window.__TAURI_INTERNALS__.invoke("list_projects"));
  const labProjects = (projects ?? []).filter(p => p.name.startsWith("Timeline Lab"));
  console.log("projetos lab encontrados:", labProjects.length);
  for (const p of labProjects) {
    const r = await page.evaluate(async (id) => {
      try { await window.__TAURI_INTERNALS__.invoke("delete_project", { id }); return "ok"; }
      catch (e) { return String(e); }
    }, p.id);
    console.log(`delete ${p.id}: ${r}`);
  }
  await browser.close().catch(() => {});
} catch (e) {
  console.error("cleanup erro:", e.message);
} finally {
  if (app && app.exitCode === null) {
    try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
    await sleep(2000);
    if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  }
  // perfil webview do lab não é mais necessário (results.json permanece)
  fs.rmSync(path.join(LAB, "webview"), { recursive: true, force: true });
  console.log("perfil webview do lab removido");
}
