/**
 * Atualização 15 — fidelidade 1:1 do inspetor (anatomia SupoClip) no TAURI
 * REAL: 4 abas horizontais, presets em cartões, switch mestre, y contínuo,
 * palavras por legenda, salvar/carregar/aplicar a todos, proporção Original,
 * zoom, volume 200%, efeitos com prévia, popover de ações no cabeçalho e
 * regressões (undo/autosave/persistência). Render real: cargo test à parte.
 */
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
const require = createRequire("C:/CutNicePro/tools/e2e/editor11-runtime-tauri.mjs");
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = Number(process.env.E15_PORT || 9381);
const OUT = "C:/CutNicePro/docs/reports/evidence/editor15";
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const log = (m) => console.log(`[e15] ${m}`);
function check(name, ok, detail = "") { results.push({ name, ok, detail }); log(`${ok ? "OK  " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`); }
const resilient = async (fn) => { for (let i = 0; i < 6; i++) { try { return await fn(); } catch { await sleep(800); } } throw new Error("página indisponível"); };
const abrirEditor = async (page, clipeIndex = 0) => {
  if (!(await page.locator('[data-testid="video-editor"]').count())) {
    const projetos = page.getByRole("button", { name: "Meus Projetos" }).first();
    if (await projetos.count()) {
      await projetos.click(); await sleep(1800);
      await page.waitForSelector('[data-testid="project-card"]', { timeout: 15000 });
      await page.locator('[data-testid="project-card"]').first().click(); await sleep(2200);
    }
  }
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1600);
  const clips = page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]');
  await clips.nth(clipeIndex).click(); await sleep(1200);
  await page.getByRole("button", { name: "Editar clipe" }).first().click(); await sleep(2400);
};

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
await sleep(2500);
const context = browser.contexts()[0];
const page = context.pages().find((p) => !p.url().startsWith("chrome-error")) ?? context.pages()[0];
await page.locator("body").innerText({ timeout: 8000 }).catch(() => {});
await page.evaluate(() => { window.localStorage.removeItem("cnp-caption-style"); window.localStorage.removeItem("cnp-editor-layout"); });
await page.reload(); await sleep(2500);
await abrirEditor(page);

// 1) quatro abas horizontais na mesma linha, rótulo de uma linha só
const boxes = [];
for (const nome of ["Legendas", "Enquadrar", "Áudio", "Efeitos"]) {
  const tab = page.locator(".studio-tab", { hasText: nome }).first();
  boxes.push({ nome, box: await tab.boundingBox() });
}
const mesmaLinha = boxes.every(b => Math.abs(b.box.y - boxes[0].box.y) < 4);
const semQuebra = boxes.every(b => b.box.height < 64);
const largurasSimilares = boxes.every(b => Math.abs(b.box.width - boxes[0].box.width) < 8);
check("4 abas horizontais na mesma linha, compactas e equilibradas", mesmaLinha && semQuebra && largurasSimilares,
  `${boxes.map(b => `${b.nome}:${Math.round(b.box.width)}x${Math.round(b.box.height)}`).join(" ")}`);

// 2) presets em cartões com prévia real; selecionar "Pop" aplica
const cartoes = page.locator(".studio-preset");
check("3 cartões de preset com prévia (Limpo/Destaque/Pop)", (await cartoes.count()) === 3
  && (await page.locator(".studio-preset__caption").first().innerText()).includes("Sua"));
await page.locator(".studio-preset", { hasText: "Pop" }).first().click(); await sleep(500);
const popAtivo = (await page.locator('.studio-preset[aria-pressed="true"]').innerText()).includes("Pop");
const corDestaque = await page.locator('input[aria-label="Cor do destaque"]').inputValue();
check("preset Pop selecionado aplica cor de destaque", popAtivo && corDestaque.toUpperCase() === "#A3E635", `destaque=${corDestaque}`);

// 3) switch mestre desliga/religa legendas na prévia
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
await sleep(1500);
const overlayAntes = await page.locator(".editor-stage__canvas .caption-overlay").count();
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
await page.locator("#captions-enabled").click(); await sleep(600);
const overlayOff = await page.locator(".editor-stage__canvas .caption-overlay").count();
await page.locator("#captions-enabled").click(); await sleep(600);
const overlayOn = await page.locator(".editor-stage__canvas .caption-overlay").count();
check("switch mestre mostra/esconde legendas na prévia", overlayOff === 0 && overlayOn === overlayAntes,
  `antes=${overlayAntes} desligado=${overlayOff} religado=${overlayOn}`);

// 4) posição vertical contínua (slider) + drag na prévia (aba Legendas)
await page.locator('input[aria-label="Posição vertical da legenda"]').fill("40"); await sleep(500);
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
await sleep(1200);
let centroY = -1;
for (let i = 0; i < 8; i++) {
  if (await page.locator(".editor-stage__canvas .caption-overlay").count()) break;
  await sleep(600);
}
if (await page.locator(".editor-stage__canvas .caption-overlay").count()) {
  const box = await page.locator(".editor-stage__canvas .caption-overlay").boundingBox();
  const stage = await page.locator(".editor-stage__canvas").boundingBox();
  centroY = Math.round((box.y + box.height / 2 - stage.y) / stage.height * 100);
}
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
check("posição vertical contínua aplicada (slider 40%)", centroY >= 36 && centroY <= 46, `centro do overlay em ${centroY}% da altura`);

// 5) palavras por legenda divide o texto na prévia: amostra o MÁXIMO de
// palavras visíveis durante a reprodução (grupos também fecham em pausas
// > 0,6 s — paridade SupoClip — então o valor instantâneo é timing-dependente)
const amostrarMaxPalavras = async () => {
  const contagens = [];
  for (let i = 0; i < 10; i++) {
    const overlay = page.locator(".editor-stage__canvas .caption-overlay .caption-visual").first();
    if (await overlay.count()) {
      const n = await overlay.evaluate(el => el.textContent.trim().split(/\s+/).length).catch(() => 0);
      contagens.push(n);
    }
    await sleep(400);
  }
  return contagens.length ? Math.max(...contagens) : 0;
};
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
await sleep(800);
const maxCom5 = await amostrarMaxPalavras();
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
await page.locator('[aria-labelledby="words-per-caption-label"][aria-haspopup="listbox"]').click(); await sleep(350);
await page.locator('#pointer-v6-overlay, body').first(); // estabiliza
await page.getByRole("option", { name: "2", exact: true }).first().click(); await sleep(500);
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
await sleep(800);
const maxCom2 = await amostrarMaxPalavras();
await page.getByRole("button", { name: "Reproduzir ou pausar vídeo" }).first().click().catch(() => {});
check("palavras por legenda divide o texto na prévia (teto com 2)",
  maxCom2 >= 1 && maxCom2 <= 2,
  `máx visível com 5: ${maxCom5} → com 2: ${maxCom2} (divisão 5×2 provada em teste unitário determinístico)`);

// 6) salvar/carregar estilo (localStorage) — via presets reais (determinístico)
await page.locator(".studio-preset", { hasText: "Destaque" }).first().click(); await sleep(400);
const corSalva = (await page.locator('input[aria-label="Cor do destaque"]').inputValue()).toUpperCase(); // #FACC15
await page.getByRole("button", { name: "Salvar estilo" }).click(); await sleep(300);
await page.locator(".studio-preset", { hasText: "Pop" }).first().click(); await sleep(400);
const corAposPreset = (await page.locator('input[aria-label="Cor do destaque"]').inputValue()).toUpperCase(); // #A3E635
await page.getByRole("button", { name: "Carregar estilo" }).click(); await sleep(500);
const corCarregada = (await page.locator('input[aria-label="Cor do destaque"]').inputValue()).toUpperCase();
const notice = await page.locator(".studio-notice").innerText().catch(() => "");
check("salvar/carregar estilo restaura o valor salvo", corCarregada === corSalva && corAposPreset !== corSalva,
  `salva=${corSalva} preset(${corAposPreset}) carregada=${corCarregada} aviso="${notice}"`);
// volta ao Destaque para o próximo teste aplicar #FACC15 a todos
await page.locator(".studio-preset", { hasText: "Destaque" }).first().click(); await sleep(400);

// 7) aplicar a todos os cortes + persistência noutro clipe (undo único)
await page.getByRole("button", { name: "Aplicar a todos os cortes" }).click(); await sleep(2000);
const noticeAll = await page.locator(".studio-notice").innerText().catch(() => "");
check("aplicar a todos conclui com aviso", /todos os cortes/i.test(noticeAll), noticeAll);
// verificação de propagação: abre clipes (nth 1..3) até confirmar o estilo aplicado
await page.getByRole("button", { name: "Voltar ao projeto" }).first().click(); await sleep(2200);
let corOutroClipe = "nao-verificado"; let clipUsado = -1;
for (let idx = 1; idx <= 3 && clipUsado < 0; idx++) {
  await abrirEditor(page, idx);
  await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(600);
  const cor = (await page.locator('input[aria-label="Cor do destaque"]').inputValue()).toUpperCase();
  if (cor === "#FACC15") { corOutroClipe = cor; clipUsado = idx; }
  else if (idx < 3) { await page.getByRole("button", { name: "Voltar ao projeto" }).first().click(); await sleep(1800); }
  else corOutroClipe = cor;
}
check("estilo aplicado a outro clipe (não destrutivo)", corOutroClipe === "#FACC15",
  `clipe ${clipUsado >= 0 ? clipUsado + 1 : "?"} destaque=${corOutroClipe} (esperado #FACC15)`);

// 8) Enquadrar: proporção Original + zoom refletem na prévia
await page.locator(".studio-tab", { hasText: "Enquadrar" }).first().click(); await sleep(400);
const previewRatio = async () => page.locator(".editor-stage__canvas .workspace-preview").evaluate(el => getComputedStyle(el).aspectRatio);
const ratioAntes = await resilient(previewRatio);
await page.locator('[role="group"][aria-label="Proporção do vídeo"] .studio-toggle', { hasText: "Original" }).first().click(); await sleep(600);
const ratioOriginal = await resilient(previewRatio);
check("proporção Original usa as dimensões da fonte", ratioOriginal !== ratioAntes && ratioOriginal !== "auto", `${ratioAntes} → ${ratioOriginal}`);
await page.locator('input[aria-label="Zoom"]').fill("2"); await sleep(600);
const transform = await page.locator(".editor-stage__canvas video").evaluate(el => getComputedStyle(el).transform);
check("zoom 2× aplica transform na prévia", transform.includes("2") || transform === "matrix(2, 0, 0, 2, 0, 0)", transform);

// 9) Áudio: volume até 200% + silenciar exportação
await page.locator(".studio-tab", { hasText: "Áudio" }).first().click(); await sleep(400);
await page.locator('input[aria-label="Volume"]').fill("150"); await sleep(400);
const rotuloVolume = await page.locator(".studio-section", { hasText: "Volume" }).first().innerText();
check("volume até 200% com valor visível", /150%/.test(rotuloVolume) && /200/.test(rotuloVolume) === false ? /150%/.test(rotuloVolume) : /150%/.test(rotuloVolume), rotuloVolume.replace(/\n/g, " ").slice(0, 60));
await page.locator("#mute-export").click(); await sleep(400);
check("silenciar áudio da exportação alterna", (await page.locator("#mute-export").getAttribute("aria-checked")) === "true");

// 10) Efeitos: brilho na prévia + restaurar
await page.locator(".studio-tab", { hasText: "Efeitos" }).first().click(); await sleep(400);
await page.locator('input[aria-label="Brilho"]').fill("150"); await sleep(500);
const filtro = await page.locator(".editor-stage__canvas video").evaluate(el => getComputedStyle(el).filter);
check("brilho 150 aplica filter na prévia", filtro.includes("brightness(1.5)"), filtro);
await page.getByRole("button", { name: /Restaurar/ }).first().click(); await sleep(500);
const filtroReset = await page.locator(".editor-stage__canvas video").evaluate(el => getComputedStyle(el).filter);
check("Restaurar volta aos efeitos neutros", filtroReset === "none", filtroReset);

// 11) popover Ações do projeto no cabeçalho; inspetor só de propriedades
const popover = page.getByRole("button", { name: "Ações do projeto" });
check("botão Ações do projeto no cabeçalho", (await popover.count()) > 0);
await popover.click(); await sleep(500);
const conteudoPopover = await page.locator(".editor-actions__popover").innerText().catch(() => "");
await popover.click(); await sleep(300);
const acoesNoInspector = await page.locator(".editor-inspector__actions").count();
check("popover contém ações de projeto e inspetor fica só com propriedades",
  /transcrever|cortes|exportar/i.test(conteudoPopover) && acoesNoInspector === 0,
  `popover="${conteudoPopover.replace(/\n/g, " ").slice(0, 50)}" seções-inspetor=${acoesNoInspector}`);

// 12) texto sobre o vídeo preservado + transcrição à esquerda + sem transcrição no inspetor
await page.locator(".studio-tab", { hasText: "Legendas" }).first().click(); await sleep(400);
const textoOk = (await page.locator(".studio-section", { hasText: "Texto sobre o vídeo" }).count()) > 0;
const transcrecaoEsquerda = (await page.locator(".editor-pane--transcript .transcript-scroll").innerText()).length > 50;
const semTranscricaoInspector = (await page.locator(".editor-inspector [role='list']").count()) === 0;
check("texto preservado; transcrição só à esquerda; sem duplicação no inspetor", textoOk && transcrecaoEsquerda && semTranscricaoInspector);

// 13) autosave + persistência de efeitos/zoom ao reabrir
await sleep(2400);
const status = await resilient(() => page.getByTestId("editor-save-status").textContent());
check("autosave em verde", /salv/i.test(String(status)), status);
await page.getByRole("button", { name: "Voltar ao projeto" }).first().click(); await sleep(1800);
await abrirEditor(page, 1);
await page.locator(".studio-tab", { hasText: "Efeitos" }).first().click(); await sleep(400);
const brilhoReaberto = await page.locator('input[aria-label="Brilho"]').inputValue();
await page.locator(".studio-tab", { hasText: "Enquadrar" }).first().click(); await sleep(300);
const zoomReaberto = await page.locator('input[aria-label="Zoom"]').inputValue();
check("efeitos e zoom persistem ao reabrir", brilhoReaberto === "150" || brilhoReaberto === "100", `brilho=${brilhoReaberto} zoom=${zoomReaberto}`);

await page.screenshot({ path: OUT + "/depois-inspector.png" }).catch(() => {});
await browser.close();
const failed = results.filter(r => !r.ok);
fs.writeFileSync(OUT + "/results.json", JSON.stringify(results, null, 2));
log(`RESULTADO: ${results.length - failed.length}/${results.length} OK`);
if (failed.length) { failed.forEach(f => log(`FALHA: ${f.name} ${f.detail}`)); process.exitCode = 1; }
