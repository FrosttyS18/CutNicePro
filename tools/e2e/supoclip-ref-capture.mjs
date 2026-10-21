/** Atualização 15 — captura da REFERÊNCIA SupoClip (laboratório local 3107):
 * login do lab, navegação até o editor de um clipe e fotografias do INSPECTOR
 * nas 4 abas + medições DOM. Montagem para o VISION QA. */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const OUT = "C:/CutNicePro/docs/reports/evidence/editor15/supoclip-ref";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("dialog", d => d.accept().catch(() => {}));
await page.goto("http://127.0.0.1:3107/", { waitUntil: "domcontentloaded", timeout: 60000 });
await sleep(4000);
await page.getByRole("link", { name: "Sign In" }).first().click().catch(() => {});
await sleep(3000);
console.log("apos signin:", page.url());
const email = page.locator('input[type="email"], input[name="email"]').first();
if (await email.count()) {
  // credenciais do laboratório ficam FORA do repositório (C:\SupoClipLab\lab-login.txt)
  const [loginEmail, loginPassword] = fs.readFileSync("C:/SupoClipLab/lab-login.txt", "utf8")
    .trim().split(/\r?\n/).filter(Boolean).map(line => line.trim()).filter(line => line.includes("@"));
  const senha = loginPassword ?? fs.readFileSync("C:/SupoClipLab/lab-login.txt", "utf8").trim().split(/\r?\n/).pop().trim();
  await email.fill(loginEmail);
  await page.locator('input[type="password"], input[name="password"]').first().fill(senha);
  await page.getByRole("button", { name: /sign in|log in|entrar/i }).first().click().catch(() => {});
  await sleep(6000);
}
console.log("apos login:", page.url());
await page.screenshot({ path: `${OUT}/02-pos-login.png` });
console.log("BODY:", JSON.stringify((await page.locator("body").innerText().catch(() => "")).slice(0, 300)));

// Library → primeiro projeto/clipes → editor
await page.getByRole("link", { name: "Library" }).first().click().catch(() => {});
await sleep(4000);
console.log("library:", page.url());
await page.screenshot({ path: `${OUT}/03-library.png` });
const task = page.locator("a[href*='/tasks/']").first();
if (await task.count()) { await task.click().catch(() => {}); await sleep(5000); }
if (!page.url().includes("/tasks/")) {
  await page.goto("http://127.0.0.1:3107/tasks/1feeffd2-d84b-4d46-9c31-2744d6cea", { waitUntil: "domcontentloaded" });
  await sleep(6000);
}
console.log("projeto:", page.url());
await page.screenshot({ path: `${OUT}/04-projeto.png` });
const linksAqui = await page.evaluate(() => [...document.querySelectorAll("a")].map(a => a.getAttribute("href") ?? "").filter(h => h.includes("edit") || h.includes("clip")).slice(0, 6));
console.log("links de edicao:", JSON.stringify(linksAqui));
const editEntry = page.locator("a[href*='/edit']").first();
if (await editEntry.count()) { await editEntry.click().catch(() => {}); await sleep(6000); }
console.log("editor:", page.url());
await page.screenshot({ path: `${OUT}/05-editor.png` });
const panel = page.locator('[aria-label="Editor tools"]');
console.log("inspector presente:", (await panel.count()) > 0);
if (await panel.count()) {
  const medidas = await panel.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const tabs = el.querySelector('[role="tablist"]')?.getBoundingClientRect();
    const tab = el.querySelector('[role="tab"]')?.getBoundingClientRect();
    return { painel: { w: Math.round(rect.width), h: Math.round(rect.height) },
      tabs: tabs ? { w: Math.round(tabs.width), h: Math.round(tabs.height) } : null,
      tab: tab ? { w: Math.round(tab.width), h: Math.round(tab.height) } : null };
  });
  console.log("medidas:", JSON.stringify(medidas));
  fs.writeFileSync(`${OUT}/medidas.json`, JSON.stringify(medidas, null, 2));
  for (const aba of ["Captions", "Framing", "Audio", "Effects"]) {
    const tab = page.getByRole("tab", { name: aba }).first();
    if (await tab.count()) {
      await tab.click().catch(() => {});
      await sleep(1200);
      await panel.screenshot({ path: `${OUT}/aba-${aba.toLowerCase()}.png` }).catch(() => {});
    }
  }
  console.log("abas capturadas");
}
await browser.close();
