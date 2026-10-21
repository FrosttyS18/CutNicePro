/** Atualização 15 — verificação DOM (números, sem imagens) das proibições de
 * layout: foco só teclado, gap de botões com ícone, padding de dropdown,
 * slider rótulo+chip na mesma linha, gaps mínimos. */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
import fs from "node:fs";
const OUT = "C:/CutNicePro/docs/reports/evidence/editor15";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(2500);
const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith("chrome-error"));
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});
if (!(await page.locator('[data-testid="video-editor"]').count())) {
  const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
  if (await projetos.count()) {
    await projetos.click(); await sleep(1800);
    await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 });
    await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200);
  }
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1600);
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2400);
}
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(600);
const r = await page.evaluate(() => {
  const out = {};
  // 1) foco no clique NÃO desenha anel (modality=pointer remove outline de botões)
  const botao = document.querySelector(".studio-preset");
  botao.focus();
  out.focoPointer = { modality: document.documentElement.dataset.inputModality, outline: getComputedStyle(botao).outlineStyle };
  // 2) botão com ícone: gap ≥ 6 e ícone não comprimido
  const salvar = [...document.querySelectorAll(".flow-button")].find(b => b.textContent.includes("Salvar estilo"));
  const cs = getComputedStyle(salvar);
  const svg = salvar.querySelector("svg");
  out.botaoIcone = { display: cs.display, gap: cs.gap, svgFlexNone: svg ? getComputedStyle(svg).flex : null,
    sobreposicao: svg && salvar.querySelector("svg + *") ? (svg.getBoundingClientRect().right <= salvar.textContent ? true : null) : null };
  // 3) dropdown com respiro lateral ≥ 10px
  const select = document.querySelector(".studio-select");
  const scs = getComputedStyle(select);
  out.dropdown = { paddingLeft: scs.paddingLeft, paddingRight: scs.paddingRight, minHeight: scs.minHeight };
  // 4) slider: rótulo esquerda + chip direita na MESMA linha; barra abaixo largura total
  const range = document.querySelector(".studio-range");
  const label = range.querySelector(".studio-field__label");
  const chip = label.querySelector("strong");
  const input = range.querySelector("input");
  const lr = label.getBoundingClientRect(), cr = chip.getBoundingClientRect(), ir = input.getBoundingClientRect();
  out.slider = { mesmaLinha: Math.abs((lr.top + lr.height / 2) - (cr.top + cr.height / 2)) < 3,
    chipDireita: cr.left >= lr.left + 60, barraLarguraTotal: Math.round(ir.width), alturaChip: Math.round(cr.height) };
  // 5) botões vizinhos com gap ≥ 8 (par Salvar/Carregar)
  const botoes = [...document.querySelectorAll(".studio-grid-2 .flow-button")].slice(0, 2);
  if (botoes.length === 2) {
    const a = botoes[0].getBoundingClientRect(), b = botoes[1].getBoundingClientRect();
    out.parBotoes = { gap: Math.round(b.left - a.right) };
  }
  // 6) label ↔ campo gap ≥ 8 (campo Fonte)
  const campo = [...document.querySelectorAll(".studio-field")].find(f => f.querySelector(".studio-select") && !f.querySelector(".studio-toggle-group"));
  if (campo) {
    const lab = campo.querySelector(".studio-field__label").getBoundingClientRect();
    const ctrl = campo.querySelector(".studio-select, input").getBoundingClientRect();
    out.labelCampo = { gap: Math.round(ctrl.top - lab.bottom) };
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
fs.writeFileSync(`${OUT}/antivice-dom.json`, JSON.stringify(r, null, 2));
await browser.close().catch(() => {});
