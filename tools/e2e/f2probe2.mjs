/** Probe 2: executa o caminho até 'Editar clipe' e dump do estado + erros de console. */
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
  WEBVIEW2_USER_DATA_FOLDER: path.join(LAB, "webview-f2-probe2"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9414" } });
await sleep(12000);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9414");
const page = browser.contexts().flatMap(c=>c.pages()).find(p=>!p.url().startsWith("chrome-error"));
page.on("console", msg => { if (["error","warning"].includes(msg.type())) console.log("CONSOLE:", msg.type(), msg.text().slice(0, 200)); });
page.on("pageerror", err => console.log("PAGEERROR:", String(err).slice(0, 200)));
await page.evaluate(({ projectId, mediaId }) => {
  localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify({
    version: 2,
    media: { kind: "local", name: "m.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId },
    transcript: [], transcriptMode: "empty",
    settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
    tool: "editor" }));
}, { projectId: MANUAL_ID, mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129" });
await page.evaluate(() => location.reload());
await sleep(6000);

// rail -> projects -> card
await page.locator('button[aria-label="Meus Projetos"]').first().click(); await sleep(2500);
await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first().waitFor({ timeout: 15000 });
await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first().click(); await sleep(3000);
await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 120000 });
console.log("projeto aberto, vídeo pronto");
const vid = await page.evaluate(() => { const v = document.querySelector("video"); return { src: v?.src?.slice(0, 30), ready: v?.readyState }; });
console.log("video:", JSON.stringify(vid));
// Cortes view
await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2500);
const cards = await page.locator('[class*="clip-card"]').count();
console.log("clip cards:", cards);
await page.locator('[class*="clip-card__open"]').first().click(); await sleep(2200);
const insp = await page.evaluate(() => ({
  dialog: [...document.querySelectorAll("dialog[open]")].map(d => d.querySelector("h2")?.textContent),
  editBtn: Boolean([...document.querySelectorAll("button")].find(b => b.textContent.includes("Editar clipe"))),
}));
console.log("inspeção:", JSON.stringify(insp));
const edit = page.getByRole("button", { name: "Editar clipe" }).first();
if (await edit.count()) {
  await edit.click();
  await sleep(9000);
}
const state = await page.evaluate(() => {
  const v = document.querySelector("video");
  const split = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Dividir no playhead"));
  const ws = null;
  return {
    editor: Boolean(document.querySelector(".timeline-surface")),
    vReady: v?.readyState ?? null, vSrc: v?.src?.slice(0, 25) ?? null,
    split: split ? { disabled: split.disabled, visible: split.offsetParent !== null } : null,
    localStorageKeys: Object.keys(localStorage).filter(k => k.startsWith("cnp.workspace")), wsRaw: localStorage.getItem("cnp.workspace.v1.9b7a59f6-e8a5-48d5-8acb-59af3a232422")?.slice(0, 120),
    crumb: [...document.querySelectorAll("nav button, .crumbs button, [class*=crumb] button")].map(b => b.textContent),
    activeClipId: ws?.activeClipId ?? null, editPlanKeys: ws?.clipEdits ? Object.keys(ws.clipEdits) : [],
    body: document.body.innerText.slice(0, 250),
  };
});
console.log(JSON.stringify(state, null, 1));
await browser.close().catch(()=>{});
try { execSync(`taskkill /PID ${app.pid} /T /F`, {stdio:"ignore"}); } catch {}
