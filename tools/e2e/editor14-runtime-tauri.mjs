/**
 * Atualização 14 — runtime TAURI REAL: linha superior da transcrição
 * removida, inspetor redimensionável pela divisória esquerda (largura
 * útil), abas + propriedades reais (Legendas/Enquadrar), ações do projeto
 * no rodapé, persistência e regressões de transcrição/timeline.
 * Exportação representativa é validada à parte (cargo test de render real).
 */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = Number(process.env.E14_PORT || 9381);
const OUT = "C:/CutNicePro/docs/reports/evidence/editor14";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const log = (m) => console.log(`[e14] ${m}`);
function check(name, ok, detail = "") { results.push({ name, ok, detail }); log(`${ok ? "OK  " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`); }
const resilient = async (fn) => { for (let i = 0; i < 6; i++) { try { return await fn(); } catch { await sleep(800); } } throw new Error("página indisponível"); };

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(2500);
const context = browser.contexts()[0];
let page = context.pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});
await page.evaluate(() => window.localStorage.removeItem("cnp-editor-layout"));
await page.reload(); await sleep(2500);

const projetosBtn = page.getByRole("button", { name: "Meus Projetos" }).first();
for (let i = 0; i < 10 && !(await projetosBtn.count()); i++) await sleep(600);
await projetosBtn.click(); await sleep(1800);
await page.getByRole("button", { name: "Todos" }).first().click().catch(() => {}); await sleep(1200);
await page.waitForSelector('[data-testid="project-card"]', { timeout: 20000 });
await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200);
await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1600);
await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200);
await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2500);

// 1) editor aberto com transcrição visível
check("editor aberto com transcrição visível",
  (await page.locator(".editor-pane--transcript h2").filter({ hasText: "Transcrição" }).count()) > 0
  && (await page.locator(".transcript-scroll").innerText()).length > 20);

// 2) linha superior decorativa removida (computed border-top do painel)
const borderTop = await page.evaluate(() => {
  const el = document.querySelector(".editor-pane--transcript .transcript-panel");
  return el ? getComputedStyle(el).borderTopWidth + " " + getComputedStyle(el).borderTopStyle : "ausente";
});
check("linha superior da transcrição removida", borderTop.startsWith("0px"), borderTop);

// 3) expandir painel direito arrastando a divisória esquerda
const inspectorWidth = () => page.locator(".editor-inspector").boundingBox().then(b => Math.round(b.width));
const larguraInicial = await resilient(inspectorWidth);
const maxAside = await page.evaluate(() => Math.min(500, window.innerWidth - 560 - 320) - 7);
const divInspector = page.locator(".editor-pane__divider--left").first();
const di = await divInspector.boundingBox();
await page.mouse.move(di.x + di.width / 2, di.y + 100);
await page.mouse.down();
await page.mouse.move(di.x - 110, di.y + 100, { steps: 8 });
await page.mouse.up(); await sleep(600);
const larguraExpandida = await resilient(inspectorWidth);
check("inspetor expandiu pela divisória esquerda (até o limite da janela)",
  larguraExpandida > larguraInicial + 25 && larguraExpandida <= maxAside + 2,
  `${larguraInicial}px → ${larguraExpandida}px (teto desta janela: ${maxAside}px)`);

// 4) reduzir painel direito
const di2 = await divInspector.boundingBox();
await page.mouse.move(di2.x + di2.width / 2, di2.y + 100);
await page.mouse.down();
await page.mouse.move(di2.x + 70, di2.y + 100, { steps: 6 });
await page.mouse.up(); await sleep(600);
const larguraReduzida = await resilient(inspectorWidth);
check("inspetor reduziu pela divisória (sem sumir)", larguraReduzida < larguraExpandida - 40 && larguraReduzida >= 300, `${larguraExpandida}px → ${larguraReduzida}px (mín 300)`);

// 4b) clamp: arrasto extremo não deixa o painel passar de 500 nem sumir com o canvas
const di3 = await divInspector.boundingBox();
await page.mouse.move(di3.x + di3.width / 2, di3.y + 100);
await page.mouse.down();
await page.mouse.move(di3.x - 800, di3.y + 100, { steps: 10 });
await page.mouse.up(); await sleep(600);
const larguraExtrema = await resilient(inspectorWidth);
const canvasBox = await page.locator(".editor-stage__canvas").boundingBox();
check("limite máximo respeitado e canvas preservado", larguraExtrema <= 500 && canvasBox.width >= 300, `inspetor=${larguraExtrema}px (máx 500), canvas=${Math.round(canvasBox.width)}px`);

// 5) alternar abas
const abas = ["Legendas", "Enquadrar", "Áudio", "Efeitos"];
let abasOk = true; let ultima = "";
for (const nome of abas) {
  const tab = page.locator(".studio-tab", { hasText: nome }).first();
  await tab.click(); await sleep(300);
  ultima = await page.locator('.studio-tab[aria-pressed="true"]').textContent();
  if (!ultima.includes(nome)) abasOk = false;
}
check("abas alternam (Legendas/Enquadrar/Áudio/Efeitos)", abasOk, `última ativa: ${ultima.trim()}`);

// 6) propriedade real de legenda reflete na prévia (Posição → data-position)
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(400);
await page.locator('input[aria-label="Posição vertical da legenda"]').fill("40"); await sleep(500);
const videoOverlay = page.locator(".editor-stage__canvas .caption-overlay");
const playButton = page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first();
await playButton.click().catch(() => {}); // play
let posicaoPreview = "sem cue no tempo atual";
for (let i = 0; i < 10 && (await videoOverlay.count()) === 0; i++) await sleep(600);
if (await videoOverlay.count()) {
  const top = await videoOverlay.first().evaluate((el) => getComputedStyle(el).top);
  const box = await videoOverlay.first().boundingBox();
  const stage = await page.locator(".editor-stage__canvas").boundingBox();
  posicaoPreview = `${Math.round((box.y + box.height / 2 - stage.y) / stage.height * 100)}% (computed top ${top})`;
}
await playButton.click().catch(() => {}); // pausa
const posicaoOk = /^4[0-6]%/.test(posicaoPreview);
check("propriedade de legenda real aplicada na prévia (y contínuo)", posicaoOk, `slider 40% → centro do overlay em ${posicaoPreview}`);

// 7) enquadramento: proporção pela aba Enquadrar
await page.locator(".studio-tab", { hasText: "Enquadrar" }).first().click(); await sleep(400);
const ratioSelecionado = async () => page.locator('.studio-toggle[aria-pressed="true"] .studio-toggle__value').first().textContent();
const ratioInicial = (await resilient(ratioSelecionado)).trim();
const alvo = ratioInicial === "1:1" ? "9:16" : "1:1";
await page.locator('[role="group"][aria-label="Proporção do vídeo"] .studio-toggle', { hasText: alvo }).first().click(); await sleep(500);
const ratioApos = (await resilient(ratioSelecionado)).trim();
check("proporção alterada na aba Enquadrar", ratioApos === alvo, `${ratioInicial} → ${ratioApos}`);

// 8) desfazer/refazer
await page.keyboard.press("Control+z"); await sleep(800);
const aposUndo = (await resilient(ratioSelecionado)).trim();
await page.keyboard.press("Control+Shift+z"); await sleep(800);
const aposRedo = (await resilient(ratioSelecionado)).trim();
check("Ctrl+Z desfaz e Ctrl+Shift+Z refaz proporção", aposUndo === ratioInicial && aposRedo === alvo, `${ratioInicial} → ${alvo} → ${aposUndo} → ${aposRedo}`);

// 9) autosave
await sleep(2400);
const status = await resilient(() => page.getByTestId("editor-save-status").textContent());
check("autosave concluiu após alterações", /salv/i.test(String(status)), status);

// 10) fechar/reabrir mantém posição da legenda (persistência)
await page.getByRole("button", { name: "Voltar ao projeto" }).first().click(); await sleep(2000);
await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1600);
await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1200);
await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2200);
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(400);
const posicaoReaberta = (await resilient(() => page.locator('input[aria-label="Posição vertical da legenda"]').inputValue())).trim();
check("persistência: posição da legenda mantida ao reabrir", posicaoReaberta === "40", posicaoReaberta);
const larguraReaberta = await resilient(inspectorWidth);
check("persistência: largura do inspetor mantida ao reabrir", Math.abs(larguraReaberta - larguraExtrema) <= 2, `${larguraExtrema}px → ${larguraReaberta}px`);

// 12) transcrição e timeline continuam redimensionáveis; busca filtra
const divTransc = page.locator(".editor-pane--transcript > .editor-pane__divider").first();
const dt = await divTransc.boundingBox();
const larguraTranscAntes = Math.round((await page.locator(".editor-pane--transcript").boundingBox()).width);
await page.mouse.move(dt.x + dt.width / 2, dt.y + 120);
await page.mouse.down();
await page.mouse.move(dt.x - 60, dt.y + 120, { steps: 6 });
await page.mouse.up(); await sleep(500);
const larguraTranscDepois = Math.round((await page.locator(".editor-pane--transcript").boundingBox()).width);
// com o inspetor estendido (400px) numa janela de 1280, o clamp impede AUMENTAR
// a transcrição (canvas mínimo protegido) — valida-se a redução, sempre livre
check("transcrição ainda redimensiona pela borda direita (reduzindo)", larguraTranscDepois < larguraTranscAntes - 30, `${larguraTranscAntes}px → ${larguraTranscDepois}px`);
const divTl = page.locator(".editor-pane__divider--horizontal").first();
const dtl = await divTl.boundingBox();
const alturaTlAntes = Math.round((await page.locator(".editor-pane--timeline").boundingBox()).height);
await page.mouse.move(dtl.x + 400, dtl.y + dtl.height / 2);
await page.mouse.down();
await page.mouse.move(dtl.x + 400, dtl.y - 60, { steps: 6 });
await page.mouse.up(); await sleep(500);
const alturaTlDepois = Math.round((await page.locator(".editor-pane--timeline").boundingBox()).height);
check("timeline ainda redimensiona pela borda superior", alturaTlDepois > alturaTlAntes, `${alturaTlAntes}px → ${alturaTlDepois}px`);
const busca = page.locator(".editor-pane--transcript input[type=\"search\"]");
await busca.fill("zzzzpalavraineexistente"); await sleep(700);
const vazio = await page.locator(".transcript-scroll").innerText();
await busca.fill(""); await sleep(400);
check("busca da transcrição filtra (termo inexistente)", /nenhum trecho encontrado/i.test(vazio), vazio.slice(0, 40));

await page.screenshot({ path: OUT + "/depois-1280.png" }).catch(() => {});
await browser.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 2));
log(`RESULTADO: ${results.length - failed.length}/${results.length} OK`);
if (failed.length) { failed.forEach(f => log(`FALHA: ${f.name} ${f.detail}`)); process.exitCode = 1; }
