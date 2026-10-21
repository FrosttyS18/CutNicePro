import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
const info = await page.evaluate(() => {
  const saida = [];
  // varre ancestrais e vizinhos do editor-layout procurando bordas/linhas no topo
  const layout = document.querySelector(".video-editor .editor-layout");
  let n = layout;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    const bordas = [];
    for (const lado of ["Top", "Bottom", "Left", "Right"]) {
      const w = cs[`border${lado}Width`], s = cs[`border${lado}Style`], c = cs[`border${lado}Color`];
      if (parseFloat(w) > 0 && s !== "none") bordas.push(`${lado}:${w} ${s} ${c}`);
    }
    const antes = getComputedStyle(n, "::before");
    if (parseFloat(antes.height) > 0 || antes.content !== "none") bordas.push(`::before h=${antes.height} bg=${antes.backgroundColor}`);
    saida.push({ el: n.tagName + "." + String(n.className).split(" ")[0], bordas });
    n = n.parentElement;
  }
  // header do editor também (linha abaixo dele?)
  const header = document.querySelector(".video-editor .editor-header");
  if (header) {
    const cs = getComputedStyle(header);
    saida.push({ el: "header.editor-header", bordas: [`bottom:${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}`, `top:${cs.borderTopWidth}`] });
  }
  return saida;
});
console.log(JSON.stringify(info, null, 1));
await browser.close().catch(() => {});
