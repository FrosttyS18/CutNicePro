import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click().catch(() => {}); await sleep(400);
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
const ui = await page.evaluate(() => {
  const r = {};
  // 1) cards de preset com o CINZA do dropdown (#151515)
  const pinativo = document.querySelector('.studio-preset:not([aria-pressed="true"])');
  r["1 card cinza #151515"] = pinativo ? getComputedStyle(pinativo).backgroundColor === "rgb(21, 21, 21)" : null;
  // 2) dropdowns = AppSelect do projeto (gatilho com respiro e caret à direita)
  const fonte = document.querySelector('button[aria-label="Fonte da legenda"]');
  const fcs = fonte ? getComputedStyle(fonte) : null;
  r["2a dropdown = AppSelect"] = Boolean(fonte);
  r["2b respiro lateral"] = fcs ? (parseFloat(fcs.paddingRight) >= 8 && parseFloat(fcs.paddingLeft) >= 8) : null;
  r["2c caret presente"] = fonte ? Boolean(fonte.querySelector("svg")) : null;
  r["2d sem select nativo no inspetor"] = document.querySelectorAll(".editor-inspector select").length === 0;
  // 3) sliders sem outline no clique do mouse (foco pointer)
  const range = document.querySelector('input[type="range"]');
  if (range) { range.focus(); }
  r["3 range sem outline no foco"] = range ? getComputedStyle(range).outlineStyle === "none" : null;
  // 4) hover do flow-button: fundo escuro + TEXTO BRANCO
  const btn = [...document.querySelectorAll(".flow-button")].find(b => b.textContent.includes("Salvar estilo"));
  if (btn) {
    const rect = btn.getBoundingClientRect();
    const evs = [];
    for (const tipo of ["pointerover", "mouseover", "mousemove"]) {
      btn.dispatchEvent(new MouseEvent(tipo, { bubbles: true, clientX: rect.x + 10, clientY: rect.y + 10 }));
    }
    const cs = getComputedStyle(btn);
    r["4 hover escuro"] = cs.backgroundColor === "rgb(36, 36, 36)";
    r["4 hover texto branco"] = cs.color === "rgb(255, 255, 255)";
  }
  // 5) transcrição semibold
  const frase = document.querySelector(".transcript-sentence");
  r["5 transcrição semibold 600"] = frase ? getComputedStyle(frase).fontWeight === "600" : null;
  // 6) flow-muted do inspetor removido
  r["6 aviso removido"] = ![...document.querySelectorAll(".editor-inspector .flow-muted")].some(p => p.textContent.includes("Para corrigir palavras"));
  // 7) zoom com botões −/+ no padrão do projeto
  const menos = document.querySelector('.timeline-zoom-btn[aria-label="Diminuir zoom"]');
  const mais = document.querySelector('.timeline-zoom-btn[aria-label="Aumentar zoom"]');
  const mcs = menos ? getComputedStyle(menos) : null;
  r["7a botoes -/+ presentes"] = Boolean(menos && mais);
  r["7b padrao branco/preto/sem outline"] = mcs ? (mcs.backgroundColor === "rgb(255, 255, 255)" && mcs.color === "rgb(10, 10, 10)" && parseFloat(mcs.borderTopWidth) === 0) : null;
  return r;
});
console.log(JSON.stringify(ui, null, 1));
// 7 funcional: clicar + aumenta o zoom da timeline
const antes = await page.evaluate(() => document.querySelector(".timeline-content")?.style.width);
await page.locator('.timeline-zoom-btn[aria-label="Aumentar zoom"]').click(); await sleep(200);
const depois = await page.evaluate(() => document.querySelector(".timeline-content")?.style.width);
console.log("zoom + amplia:", antes, "→", depois, "|", antes !== depois);
await browser.close().catch(() => {});
