import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const EXE = "C:/CutNicePro/app/src-tauri/target-refino/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MANUAL_ID = fs.readFileSync(path.join(LAB, "manual-project-id.txt"), "utf8").trim();

const app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
  WEBVIEW2_USER_DATA_FOLDER: path.join(LAB, "webview-f2-probe"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9413" } });
await sleep(12000);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9413");
const page = browser.contexts().flatMap(c=>c.pages()).find(p=>!p.url().startsWith("chrome-error"));
await page.evaluate(({ projectId, mediaId }) => {
  localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
    version: 2,
    media: { kind: "local", name: "m.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
    transcript: [], transcriptMode: "empty",
    settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
    tool: "editor" }));
}, { projectId: MANUAL_ID, mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129" });
await page.evaluate(() => location.reload());
await sleep(5000);
for (let i = 0; i < 4; i++) {
  const inEditor = await page.evaluate(() => Boolean(document.querySelector(".timeline-surface")));
  if (inEditor) break;
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Meus Projetos")); if (b) b.click(); });
  await sleep(2000);
  await page.evaluate(() => { const c = [...document.querySelectorAll('[data-testid="project-card"]')].find(c => c.textContent.includes("TXT Aceite Manual")); if (c) c.click(); });
  await sleep(3000);
}
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(b => /Cortes \(/.test(b.textContent)); if (b) b.click(); });
await sleep(2500);
await page.evaluate(() => { const b = [...document.querySelectorAll('[class*="clip-card__open"]')][0]; if (b) b.click(); });
await sleep(2000);
await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Editar clipe")); if (b) b.click(); });
await sleep(4000);
const state = await page.evaluate(() => {
  const v = document.querySelector("video");
  const split = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Dividir no playhead"));
  return {
    editor: Boolean(document.querySelector(".timeline-surface")),
    videoReady: v?.readyState ?? null, videoSrc: v?.src?.slice(0, 30) ?? null,
    splitBtn: split ? { found: true, disabled: split.disabled, visible: split.offsetParent !== null } : { found: false },
    dialogOpen: [...document.querySelectorAll("dialog[open]")].map(d => d.querySelector("h2")?.textContent ?? "?"),
    bodyHead: document.body.innerText.slice(0, 160),
  };
});
console.log(JSON.stringify(state, null, 1));
await browser.close().catch(()=>{});
try { execSync(`taskkill /PID ${app.pid} /T /F`, {stdio:"ignore"}); } catch {}
