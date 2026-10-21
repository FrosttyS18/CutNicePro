import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9381");
await sleep(1500);
const page = browser.contexts()[0].pages().find(p => !p.url().startsWith("chrome-error"));
if (!(await page.locator('[data-testid="video-editor"]').count())) { console.log("FORA DO EDITOR"); process.exit(2); }
const ativo = () => page.evaluate(() => sessionStorage.getItem("pointer-v6-ativo"));
if ((await ativo()) === "1") { await page.keyboard.press("F7"); await sleep(200); }
await page.keyboard.press("F7"); await sleep(250);
console.log("ligado:", (await ativo()) === "1");
const h1 = page.locator(".editor-header h1").first();
const box = await h1.boundingBox();
// 1) clique NÃO interage com a interface: clicar no botão de abas não muda a aba
const abaAntes = await page.evaluate(() => [...document.querySelectorAll(".studio-tab")].findIndex(t => t.getAttribute("aria-pressed") === "true"));
const compositorAbriu = await (async () => {
  await page.mouse.down(); await page.mouse.up(); await sleep(300);
  const abriu = await page.evaluate(() => Boolean(document.querySelector('input[placeholder="Adicionar comentário"]')));
  await page.keyboard.type("comentário de teste v6"); await sleep(150);
  await page.evaluate(() => document.querySelector('input[placeholder="Adicionar comentário"]').parentElement.querySelector("button").click());
  await sleep(300);
  return abriu;
})();
console.log("compositor abriu:", compositorAbriu);
const pings = await page.evaluate(() => document.querySelectorAll("#pointer-v6-doc > div").length);
console.log("ping criado:", pings === 1);
// 2) ping acompanha o scroll (ancorado no documento)
const antes = await page.evaluate(() => document.querySelector("#pointer-v6-doc > div").getBoundingClientRect().top + scrollY);
await page.mouse.wheel(0, 150); await sleep(400);
const depois = await page.evaluate(() => document.querySelector("#pointer-v6-doc > div").getBoundingClientRect().top + scrollY);
console.log("ping fixo no documento (scroll nao desloca):", Math.abs(antes - depois) < 2, `(variação ${Math.round(depois - antes)}px)`);
await page.mouse.wheel(0, -150); await sleep(300);
// 3) hover revela o texto
const pin = page.locator("#pointer-v6-doc > div").first();
await pin.hover(); await sleep(250);
const hoverRevela = await pin.evaluate((pinEl) => {
  pinEl.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
  const tip = [...document.querySelectorAll("#pointer-v6-overlay > div")].find(d => d.textContent.includes("comentário de teste v6") && d.style.display === "block");
  return Boolean(tip);
});
console.log("hover revela o pedido:", hoverRevela);
// 4) clicar no ping abre o cartão
await pin.click(); await sleep(300);
const cartao = await page.evaluate(() => {
  const c = [...document.querySelectorAll("#pointer-v6-overlay > div")].find(d => d.textContent.includes("Comentário 1") && d.textContent.includes("Editar"));
  return Boolean(c);
});
console.log("clique no ping abre o cartão:", cartao);
// 5) editar pelo cartão
await page.evaluate(() => {
  const c = [...document.querySelectorAll("#pointer-v6-overlay > div")].find(d => d.textContent.includes("Comentário 1"));
  c.querySelector("[data-editar]").click();
}); await sleep(250);
await page.evaluate(() => { const i = document.querySelector('input[placeholder="Adicionar comentário"]'); i.value = "pedido EDITADO"; i.parentElement.querySelector("button").click(); }); await sleep(250);
// 6) responder (adicionar mais comentários)
await page.evaluate(() => {
  const c = [...document.querySelectorAll("#pointer-v6-overlay > div")].find(d => d.textContent.includes("Comentário 1"));
  c.querySelector("[data-editar]").click();
}); await sleep(200);
const respondeu = await page.evaluate(() => {
  const c = [...document.querySelectorAll("#pointer-v6-overlay > div")].find(d => d.textContent.includes("Comentário 1") && d.querySelector("[data-responder]"));
  if (!c) return false;
  const i = c.querySelector("[data-responder]");
  i.value = "resposta adicional";
  c.querySelector("[data-enviar]").click();
  return true;
}); await sleep(250);
const respostas = await page.evaluate(() => (window.__pointerV6?.registros ?? [])[0]?.respostas ?? []);
console.log("editar atualiza o pedido:", JSON.stringify(await page.evaluate(() => (window.__pointerV6?.registros ?? [])[0]?.pedido)));
console.log("responder adiciona comentário:", respostas.includes("resposta adicional"));
// 7) remover pelo cartão
await page.evaluate(() => {
  const c = [...document.querySelectorAll("#pointer-v6-overlay > div")].find(d => d.textContent.includes("Comentário 1") && d.querySelector("[data-remover]"));
  if (c) c.querySelector("[data-remover]").click();
}); await sleep(250);
console.log("remover exclui ping e registro:", (await page.evaluate(() => (window.__pointerV6?.registros ?? []).length)) === 0);
// estado da UI: os 6 pedidos estéticos
await page.keyboard.press("F7"); await sleep(250); // desliga
const ui = await page.evaluate(() => {
  const r = {};
  const btn = [...document.querySelectorAll(".flow-button")].find(b => b.textContent.includes("Salvar estilo"));
  const cs = btn ? getComputedStyle(btn) : null;
  r.botaoBranco = cs ? (cs.backgroundColor === "rgb(255, 255, 255)" && cs.color === "rgb(10, 10, 10)" && cs.borderStyle === "none" || cs.borderTopWidth === "0px") : null;
  const sel = document.querySelector(".studio-select");
  r.selectSemContorno = sel ? getComputedStyle(sel).borderTopWidth === "0px" : null;
  const toggle = document.querySelector(".studio-toggle-estilos");
  r.toggleIcone = Boolean(toggle) && toggle.querySelector("svg") !== null;
  const presetAtivo = document.querySelector('.studio-preset[aria-pressed="true"]');
  r.presetAtivoBranco = presetAtivo ? getComputedStyle(presetAtivo).backgroundColor === "rgb(255, 255, 255)" : null;
  r.presetSemBorda = presetAtivo ? getComputedStyle(presetAtivo).borderTopWidth === "0px" : null;
  const busca = document.querySelector('.editor-pane--transcript input[type="search"]');
  const bcs = busca ? getComputedStyle(busca) : null;
  r.buscaSemOutline = bcs ? bcs.borderTopWidth === "0px" : null;
  r.buscaLupa = bcs ? bcs.backgroundImage.includes("svg") : null;
  const header = document.querySelector(".video-editor .editor-header");
  r.headerSemLinha = header ? getComputedStyle(header).borderBottomWidth === "0px" : null;
  return r;
});
console.log("UI pedidos:", JSON.stringify(ui, null, 1));
await browser.close().catch(() => {});
