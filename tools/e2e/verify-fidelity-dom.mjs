/** Atualização 15 — verificação DOM (sem imagens) das correções de fidelidade:
 * respiro interno do corpo do inspetor, valor do slider como chip à direita e
 * linha única de "Palavras por legenda". */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const OUT = "C:/CutNicePro/docs/reports/evidence/editor15";
import fs from "node:fs";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(2000);
const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages?.[0];
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
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(500);
const dados = await page.evaluate(() => {
  const body = document.querySelector(".editor-inspector__body");
  const bodyCs = getComputedStyle(body);
  const desc = body.querySelector(".studio-section p");
  const range = body.querySelector(".studio-range .studio-field__label");
  const strong = range?.querySelector("strong");
  const labelRect = range?.getBoundingClientRect();
  const strongRect = strong?.getBoundingClientRect();
  const words = document.getElementById("words-per-caption-label");
  const wordsRect = words?.getBoundingClientRect();
  const select = document.querySelector(".studio-select--narrow");
  const selectCs = select ? getComputedStyle(select) : null;
  return {
    respiroCorpo: { left: bodyCs.paddingLeft, right: bodyCs.paddingRight, top: bodyCs.paddingTop },
    descricaoInteira: desc ? { texto: desc.textContent, overflow: desc.scrollWidth <= desc.clientWidth + 1 } : null,
    chipValor: strong ? {
      gapLabelFimAteChip: strongRect && labelRect ? Math.round(strongRect.left - (labelRect.left + range.querySelector("span, strong") ? 0 : 0)) : null,
      chipDireitaDaLinha: strongRect && labelRect ? strongRect.right >= labelRect.right - 40 : null,
      chipFundo: getComputedStyle(strong).backgroundColor,
    } : null,
    palavrasUmaLinha: words ? { altura: Math.round(wordsRect.height), umaLinha: wordsRect.height < 26 } : null,
    selectLargura: selectCs ? selectCs.width : null,
  };
});
console.log(JSON.stringify(dados, null, 1));
fs.writeFileSync(`${OUT}/fidelidade-dom.json`, JSON.stringify(dados, null, 2));
await browser.close().catch(() => {});
