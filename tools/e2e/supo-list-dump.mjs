import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto("http://127.0.0.1:3107/sign-in", { waitUntil: "domcontentloaded" });
await sleep(3000);
await page.locator('input[type="email"]').first().fill("lab@supoclip.local");
await page.locator('input[type="password"]').first().fill("LabTest-2026-local");
await page.getByRole("button", { name: /sign in|log in/i }).first().click();
await sleep(6000);
await page.goto("http://127.0.0.1:3107/list", { waitUntil: "domcontentloaded" });
await sleep(4000);
const dump = await page.evaluate(() => [...document.querySelectorAll("a, button")].slice(0, 40)
  .map(el => `${el.tagName}:${(el.getAttribute("href") ?? el.textContent ?? "").trim().slice(0, 40)}`).filter(t => t.length > 4));
console.log(dump.join("\n"));
await browser.close();
