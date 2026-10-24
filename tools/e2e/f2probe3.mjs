/** Probe 3: clica Editar clipe e monitora activeClipId em intervalos curtos. */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const EXE = "C:/CutNicePro/app/src-taurino/debug/none.exe";
const REAL_EXE = "C:/CutNicePro/app/src-tauri/target-refino/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/mm-lab";
const MANUAL = "9b7a59f6-e8a5-48d5-8acb-59af3a232422";

const app = spawn(REAL_EXE, [], { stdio: "ignore", env: { ...process.env,
  WEBVIEW2_USER_DATA_FOLDER: path.join(LAB, "webview-f2-probe3"),
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9415" } });
await sleep(12000);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9415");
const page = browser.contexts().flatMap(c=>c.pages()).find(p=>!p.url().startsWith("chrome-error"));
page.on("console", m => { if (m.type() === "error") console.log("CONSOLE-ERR:", m.text().slice(0, 150)); });
await page.evaluate((MANUAL) => {
  localStorage.setItem(`cnp.workspace.v1.${MANUAL}`, JSON.stringify({
    version: 2,
    media: { kind: "local", name: "m.mp4", videoId: null, url: null, width: 1920, height: 1080, duration: 1476.789116, mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129" },
    transcript: [], transcriptMode: "empty",
    settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1, muted: false, background: "#000000", trimStart: 0, trimEnd: null },
    tool: "editor" }));
}, MANUAL);
await page.evaluate(() => location.reload());
await sleep(6000);
await page.locator('button[aria-label="Meus Projetos"]').first().click(); await sleep(2500);
await page.locator('[data-testid="project-card"]').filter({ hasText: "TXT Aceite Manual" }).first().click(); await sleep(3000);
await page.waitForFunction(() => { const v = document.querySelector("video"); return v && v.src.startsWith("blob:") && v.readyState >= 1; }, null, { timeout: 120000 });
await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(2500);
await page.locator('[class*="clip-card__open"]').first().click(); await sleep(2200);
const edit = page.getByRole("button", { name: "Editar clipe" }).first();
console.log("botão Editar clipe:", await edit.count(), "disabled:", await edit.isDisabled().catch(() => "?"));
await edit.click();
for (let i = 0; i < 10; i++) {
  await sleep(1000);
  const s = await page.evaluate((MANUAL) => {
    const ws = JSON.parse(localStorage.getItem(`cnp.workspace.v1.${MANUAL}`) ?? "{}");
    const split = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Dividir no playhead"));
    return { active: (ws.activeClipId ?? "").slice(0, 8), plan: ws.clipEdits ? Object.keys(ws.clipEdits).length : 0,
      tool: ws.tool, split: split ? split.disabled : null,
      notice: document.querySelector('[role="alert"]')?.textContent?.slice(0, 100) ?? null };
  }, MANUAL);
  console.log(`t+${i + 1}s`, JSON.stringify(s));
  if (s.split === false) break;
}
const media = await page.evaluate(async () => {
  const m = await window.__TAURI_INTERNALS__.invoke("get_media", { mediaId: "33932fbc-5a4d-42a6-8784-f7c1f0231129" });
  return { projectIds: m?.projectIds?.length ?? null, unavailable: m?.unavailable ?? null, analysis: Boolean(m?.analysis) };
});
console.log("get_media:", JSON.stringify(media));
await browser.close().catch(()=>{});
try { execSync(`taskkill /PID ${app.pid} /T /F`, {stdio:"ignore"}); } catch {}
