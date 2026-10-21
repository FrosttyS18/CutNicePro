import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
const r = {};
// n3: abas ativas BRANCAS com ícone/texto pretos
const abaAtiva = page.locator('.studio-tab[aria-pressed="true"]').first();
const csAba = await abaAtiva.evaluate(el => { const c = getComputedStyle(el); return { bg: c.backgroundColor, cor: c.color }; });
r["n3 aba ativa branca/preto"] = csAba.bg === "rgb(255, 255, 255)" && csAba.cor === "rgb(10, 10, 10)";
// n1: preset inativo cinza #151515
const preset = page.locator('.studio-preset:not([aria-pressed="true"])').first();
r["n1 preset cinza"] = await preset.evaluate(el => getComputedStyle(el).backgroundColor === "rgb(21, 21, 21)");
// n2: AppSelect "5" visível sem corte (largura do texto dentro do trigger)
const gatilho = page.locator('[aria-labelledby="words-per-caption-label"][aria-haspopup="listbox"]');
r["n2 valor 5 visível"] = await gatilho.evaluate(el => {
  const span = el.querySelector("span");
  return span && span.getBoundingClientRect().width >= 6 && getComputedStyle(el).paddingRight !== "0px";
});
// n4: toast aparece ao salvar e some (animação)
const toastAntes = await page.locator('[data-testid="editor-toast"]').count();
await page.keyboard.press("F7"); await sleep(200); // garante desligado p/ interagir
if ((await page.evaluate(() => sessionStorage.getItem("pointer-v6-ativo"))) === "1") { await page.keyboard.press("F7"); await sleep(200); }
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(300);
await page.locator('input[aria-label="Tamanho da legenda"]').fill("72"); await sleep(2600);
const toastDepois = await page.locator('[data-testid="editor-toast"]').count();
const toastTexto = await page.locator('[data-testid="editor-toast"]').textContent().catch(() => "");
r["n4 toast aparece ao salvar"] = `antes=${toastAntes} depois=${toastDepois} texto=${String(toastTexto).trim()}`;
// n1b: hover do zoom − escuro com ícone branco
const btnMenos = page.locator('.timeline-zoom-btn[aria-label="Diminuir zoom"]');
await btnMenos.hover(); await sleep(200);
r["n1b zoom hover escuro/branco"] = await btnMenos.evaluate(el => {
  const c = getComputedStyle(el);
  return c.backgroundColor === "rgb(36, 36, 36)" && c.color === "rgb(255, 255, 255)";
});
// n1c: tamanho 20% menor (21px)
r["n1c zoom 21px"] = await btnMenos.evaluate(el => getComputedStyle(el).height === "21px" && getComputedStyle(el).width === "21px");
// n5: transcrição semibold
const frase = page.locator(".transcript-sentence").first();
r["n5 semibold 600"] = await frase.evaluate(el => getComputedStyle(el).fontWeight === "600");
// n6: aviso removido
r["n6 aviso removido"] = (await page.locator(".editor-inspector .flow-muted").count()) === 0;
// n7(novo): slider do zoom sem outline no clique
await page.evaluate(() => document.querySelector('.timeline-zoom input[type="range"]').focus()); await sleep(150);
r["n7 zoom slider sem outline"] = await page.evaluate(() => getComputedStyle(document.querySelector('.timeline-zoom input[type="range"]')).outlineStyle === "none");
console.log(JSON.stringify(r, null, 1));
await page.screenshot({ path: "C:/CutNicePro/docs/reports/evidence/editor15/adendo4-legendas.png" });
await browser.close().catch(() => {});
