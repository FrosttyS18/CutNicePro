/**
 * Atualização 13 — runtime TAURI REAL: editor com Enquadrar arrastável,
 * Cortar tempo, painéis redimensionáveis/recolhíveis, header compacto e
 * regressões de undo/autosave/restauração.
 */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = Number(process.env.E13_PORT || 9381);
const OUT = "C:/CutNicePro/docs/reports/evidence/editor13";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function log(m) { console.log(`[e13] ${m}`); }
function check(name, ok, detail = "") { results.push({ name, ok, detail }); log(`${ok ? "OK  " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`); }

const resilient = async (fn) => { for (let i = 0; i < 6; i++) { try { return await fn(); } catch { await sleep(800); } } throw new Error("página indisponível"); };

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(4000);
const context = browser.contexts()[0];
let page = context.pages().find(p => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
for (let i = 0; i < 15; i++) { const b = await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""); if (b.includes("Início")) break; await sleep(800); }
await page.goto(page.url()).catch(() => {});
await sleep(2500);
const projetosBtn = page.getByRole("button", { name: "Meus Projetos" }).first();
for (let i = 0; i < 10 && !(await projetosBtn.count()); i++) await sleep(600);
await projetosBtn.click(); await sleep(2000);
await page.getByRole("button", { name: "Todos" }).first().click().catch(() => {}); await sleep(1500);
await page.waitForSelector('[data-testid="project-card"]', { timeout: 20000 });
await page.locator('[data-testid="project-card"]').first().click(); await sleep(2500);
await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200);
await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2500);

// 1) header compacto com ícones
check("header compacto com botão ícone Voltar", (await page.getByRole("button", { name: "Voltar ao projeto" }).count()) > 0);
check("desfazer como botão ícone", (await page.getByRole("button", { name: /Desfazer \(Ctrl\+Z\)/ }).count()) > 0);
check("restaurar como botão ícone", (await page.getByRole("button", { name: "Restaurar corte original" }).count()) > 0);

// 2) Enquadrar: modo ativo com feedback + hint + canvas com data-framing
const enquadrar = page.getByRole("button", { name: "Enquadrar" }).first();
check("botão Enquadrar presente", (await enquadrar.count()) > 0);
await enquadrar.click(); await sleep(600);
const canvas = page.locator(".editor-stage__canvas").first();
check("modo Enquadrar ativo (canvas marcado)", (await canvas.getAttribute("data-framing")) === "true");
check("hint do modo Enquadrar visível", (await page.getByRole("status").filter({ hasText: "Modo Enquadrar ativo" }).count()) > 0);
await page.locator(".studio-tab", { hasText: "Enquadrar" }).first().click(); await sleep(400);
check("fit mudou para Preencher", (await page.locator('.studio-toggle--wide[aria-pressed="true"]').textContent()).includes("Preencher"));

// 3) arraste no canvas muda o ponto focal (x inicial 50)
const focalX = () => page.locator('input[aria-label="Posição horizontal"]').first().inputValue().catch(() => "?");
const xAntes = await focalX();
const box = await canvas.boundingBox();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 - 80, box.y + box.height / 2, { steps: 6 });
await page.mouse.up();
await sleep(800);
const xDepois = await focalX();
check("arraste no canvas moveu o ponto focal", xDepois !== xAntes && xDepois !== "?", `${xAntes} → ${xDepois}`);

// 4) sair do modo: botão Concluir
const concluir = page.getByRole("button", { name: "Concluir enquadramento" }).first();
await concluir.click(); await sleep(400);
check("Concluir encerrou o modo", (await canvas.getAttribute("data-framing")) === "false");

// 5) Cortar tempo: foco no campo Início com duração visível
const cortar = page.getByRole("button", { name: "Cortar tempo" }).first();
check("botão Cortar tempo presente", (await cortar.count()) > 0);
await cortar.click(); await sleep(900);
const trimLabel = await page.locator("#editor-trim legend").textContent().catch(() => "");
check("campo de corte de tempo focado e rotulado", /Corte do vídeo/i.test(String(trimLabel)), trimLabel);

// 6) painéis redimensionáveis PELA BORDA (sem botões): transcrição
const semBotoesPainel = await page.locator(".editor-pane--transcript > button, .editor-pane__controls button").count();
check("transcrição sem botões de retrair (fora do conteúdo)", semBotoesPainel === 0, `botões=${semBotoesPainel}`);
await page.evaluate(() => window.localStorage.removeItem("cnp-editor-layout"));
await page.reload(); await sleep(2500);
await page.getByRole("button", { name: /Cortes \(/ }).first().click().catch(async () => {
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1500);
  await page.locator('[data-testid="project-card"]').first().click(); await sleep(1800);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1500);
});
await sleep(1500);
await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1000);
await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2200);
const dividerTransc = page.locator(".editor-pane__divider").first();
const boxTransc = await dividerTransc.boundingBox();
const paneTransc = await page.locator(".editor-pane--transcript").boundingBox();
const larguraAntes = Math.round(paneTransc.width);
await page.mouse.move(boxTransc.x + boxTransc.width / 2, boxTransc.y + boxTransc.height / 2);
await page.mouse.down();
await page.mouse.move(boxTransc.x + 120, boxTransc.y + boxTransc.height / 2, { steps: 8 });
await page.mouse.up(); await sleep(600);
const larguraDepois = Math.round((await page.locator(".editor-pane--transcript").boundingBox()).width);
check("arraste da borda direita redimensionou a transcrição", larguraDepois > larguraAntes, `${larguraAntes}px → ${larguraDepois}px`);

// 7) timeline pela borda SUPERIOR (separa o canvas)
const semBotoesTimeline = await page.locator(".editor-pane--timeline > button, .editor-pane__controls button").count();
check("timeline sem botões de retrair (fora do conteúdo)", semBotoesTimeline === 0, `botões=${semBotoesTimeline}`);
const dividerTimeline = page.locator(".editor-pane__divider--horizontal").first();
const first = (await dividerTimeline.boundingBox());
const alturaAntes = Math.round((await page.locator(".editor-pane--timeline").boundingBox()).height);
await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
await page.mouse.down();
await page.mouse.move(first.x + first.width / 2, first.y + 100, { steps: 8 });
await page.mouse.up(); await sleep(600);
const alturaDepois = Math.round((await page.locator(".editor-pane--timeline").boundingBox()).height);
check("arraste da borda superior redimensionou a timeline", Math.abs(alturaDepois - alturaAntes) > 30, `${alturaAntes}px → ${alturaDepois}px`);

// 8) inspector por categorias com abas horizontais (atualização 15)
for (const cat of ["Legendas", "Enquadrar", "Áudio", "Efeitos"]) {
  const tab = page.locator(".studio-tab", { hasText: cat }).first();
  if (await tab.count()) { await tab.click(); await sleep(300); }
}
const ativa = await page.locator('.studio-tab[aria-pressed="true"]').textContent().catch(() => "?");
check("abas de categoria funcionam (Efeitos ativa)", String(ativa).includes("Efeitos"), ativa);

// 9) regressão undo por atalho (Ctrl+Z)
const ratioValue = async () => { const toggle = page.locator('.studio-toggle[aria-pressed="true"] .studio-toggle__value'); return (await toggle.count()) ? (await toggle.textContent()).trim() : "?"; };
await page.locator(".studio-tab", { hasText: "Enquadrar" }).first().click(); await sleep(400);
const inicial = await ratioValue();
const alvo = inicial === "1:1" ? "9:16" : "1:1";
await page.locator('[role="group"][aria-label="Proporção do vídeo"] .studio-toggle', { hasText: alvo }).first().click(); await sleep(600);
await page.keyboard.press("Control+z"); await sleep(800);
const aposCtrlZ = await resilient(ratioValue);
check("Ctrl+Z desfaz edição de proporção", aposCtrlZ === inicial, `${inicial} → ${alvo} → ${aposCtrlZ}`);

// 10) autosave persiste (status) e screenshot final
await sleep(2400);
const status = await resilient(() => page.getByTestId("editor-save-status").textContent());
check("autosave em verde após operações", /salv/i.test(String(status)), status);
await page.screenshot({ path: OUT + "/editor13-final.png" }).catch(() => {});

await browser.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 2));
log(`RESULTADO: ${results.length - failed.length}/${results.length} OK`);
if (failed.length) { failed.forEach(f => log(`FALHA: ${f.name} ${f.detail}`)); process.exitCode = 1; }
