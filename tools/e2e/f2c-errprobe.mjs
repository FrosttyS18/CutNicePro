/** f2c-errprobe — capturar o ERRO CRU do export_video acionado pelo botão
 * real (patch do __TAURI_INTERNALS__.invoke no MUNDO PRINCIPAL via CDP
 * Runtime.evaluate; page.evaluate isolado não cruza — gotcha conhecido). */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9413;

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(1000);
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => { const u = typeof p.url === "function" ? p.url() : p.url; return !String(u).startsWith("chrome-error"); });
const cdp = await ctx.newCDPSession(page);

const r = await cdp.send("Runtime.evaluate", { expression: `(() => {
  if (window.__f2cPatched) return "já patcheado";
  window.__f2cLog = [];
  const orig = window.__TAURI_INTERNALS__.invoke;
  window.__TAURI_INTERNALS__.invoke = function (cmd, args, options) {
    const p = orig.call(this, cmd, args, options);
    if (cmd === "export_video" || cmd === "clips_get" || cmd === "get_clips") {
      window.__f2cLog.push({ cmd, t: Date.now() });
      p.then(v => { const e = window.__f2cLog[window.__f2cLog.length - 1]; e.ok = v; },
             err => { const e = window.__f2cLog[window.__f2cLog.length - 1]; e.err = String(err && err.message || err); });
    }
    return p;
  };
  window.__f2cPatched = true;
  return "patcheado";
})()`, awaitPromise: false });
console.log("[probe] patch:", JSON.stringify(r.result?.value));

// fechar painel de erro se aberto e clicar Baixar do card-alvo (sintético —
// comprovado equivalente: o handler roda no mundo principal de qualquer forma)
const close = page.locator(".clip-download__problem button", { hasText: "Fechar" });
if (await close.count()) { await close.click(); await sleep(600); }
const card = page.locator('[class*="clip-card"]').filter({ hasText: "Como identificar problemas" }).first();
await card.locator("button", { hasText: "Baixar" }).first().click();
console.log("[probe] clique Baixar feito; aguardando resultado do invoke…");
await sleep(6000);

const out = await cdp.send("Runtime.evaluate", { expression: "JSON.stringify(window.__f2cLog ?? [])", awaitPromise: false });
console.log("[probe] __f2cLog:", out.result?.value);
process.exit(0);
