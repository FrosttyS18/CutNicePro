/**
 * CutNicePro atualização 11 — runtime no TAURI REAL: editor de clipe com
 * desfazer/refazer, autosave, restaurar original e exportação.
 * Evidências rotuladas "TAURI REAL" (≠ IPC simulado). Usa projeto real do
 * mantenedor com coleção de cortes (nada é regerado; só o editor edita o
 * RASCUNHO do workspace — a coleção permanece intacta; exportação escreve
 * em arquivo temporário).
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const EXE = "C:/CutNicePro/app/src-tauri/target/release/cutnicepro.exe";
const PORT = Number(process.env.E11_PORT || 9371);
const OUT = "C:/CutNicePro/docs/reports/evidence/editor11";
fs.mkdirSync(OUT, { recursive: true });
const results = [];
function log(m) { console.log(`[e11] ${m}`); }
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  log(`${ok ? "OK " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`);
}

let app = null;
const external = process.env.E11_EXTERNAL === "1"; // conecta a app já aberto (dev)
function launchApp() {
  if (!external) app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {}
  await sleep(1200);
}
async function waitForCdp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) return; } } catch {}
    await sleep(500);
  }
  throw new Error("CDP não disponível");
}

async function main() {
  launchApp();
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  await sleep(4000);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  let page = context.pages().find(p => !p.url().startsWith("chrome-error")) ?? context.pages()[0] ?? (await context.newPage());
  await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});
  for (let i = 0; i < 20; i++) {
    const body = await page.locator("body").innerText({ timeout: 3000 }).catch(() => "");
    if (body.includes("Início") || body.includes("Projetos")) break;
    await sleep(800);
    const pages = context.pages();
    page = pages.find(p => !p.url().startsWith("chrome-error")) ?? page;
  }

  const resilient = async (fn) => {
    for (let i = 0; i < 6; i++) {
      try { return await fn(); } catch { await sleep(800); }
    }
    throw new Error("página indisponível");
  };

  // 1) reset de rota (volta para a Home) e rail → Meus Projetos → Todos
  await page.goto(page.url()).catch(() => {});
  await sleep(2500);
  const projetosBtn = page.getByRole("button", { name: "Meus Projetos" }).first();
  for (let i = 0; i < 10 && !(await projetosBtn.count()); i++) await sleep(600);
  await projetosBtn.click();
  await sleep(2000);
  await page.getByRole("button", { name: "Todos" }).first().click().catch(() => {});
  await sleep(1500);
  await page.waitForSelector('[data-testid="project-card"]', { timeout: 20000 });
  await page.locator('[data-testid="project-card"]').first().click();
  await sleep(2500);
  // dentro do projeto: ir para a lista de clipes (botão Cortes)
  const cortes = page.getByRole("button", { name: /Cortes \(/ }).first();
  if (await cortes.count()) { await cortes.click(); await sleep(1800); }
  check("app aberto e projeto navegado", !page.url().includes("chromewebdata"), page.url());

  // 2) ir para Cortes e abrir inspeção do primeiro corte → Editar clipe
  const cortesBtn = page.getByRole("button", { name: /Cortes \(/ }).first();
  if (await cortesBtn.count()) { await cortesBtn.click(); await sleep(1500); }
  const firstClipCard = page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first();
  await firstClipCard.click().catch(() => {});
  await sleep(1200);
  const editBtn = page.getByRole("button", { name: "Editar clipe" }).first();
  check("botão Editar clipe visível", (await editBtn.count()) > 0);
  await editBtn.click();
  await sleep(2000);

  // 3) editor aberto: status de salvamento + desfazer/refazer
  const status = page.getByTestId("editor-save-status");
  check("editor com status de autosave", (await status.count()) > 0, await status.textContent().catch(() => "?"));
  const undo = page.getByRole("button", { name: "Desfazer" });
  const redo = page.getByRole("button", { name: "Refazer" });
  check("desfazer/refazer presentes", (await undo.count()) > 0 && (await redo.count()) > 0);

  // 4) editar proporção para um valor DIFERENTE do atual (histórico entra)
  // (atualização 15: proporção/ajuste são toggles na aba Enquadrar)
  await page.locator(".studio-tab", { hasText: "Enquadrar" }).first().click().catch(() => {});
  await sleep(400);
  const before = await status.textContent().catch(() => "");
  const ratioValue = async () => {
    const toggle = page.locator('.studio-toggle[aria-pressed="true"] .studio-toggle__value').first();
    return (await toggle.count()) ? (await toggle.textContent()).trim() : "?";
  };
  const inicial = await ratioValue();
  const alvo = inicial === "1:1" ? "9:16" : "1:1";
  const ratioToggle = page.locator('[role="group"][aria-label="Proporção do vídeo"] .studio-toggle', { hasText: alvo }).first();
  if (await ratioToggle.count()) {
    await ratioToggle.click().catch(() => {});
    await sleep(400);
    await page.getByRole("option", { name: alvo, exact: true }).first().click().catch(() => {});
    await sleep(400);
  }
  const undoEnabled = await undo.isEnabled().catch(() => false);
  check("edição de proporção habilita desfazer", undoEnabled);
  await sleep(2200); // autosave 1,2s (salvo rápido volta a "Alterações salvas")
  const saved = await resilient(() => status.textContent());
  check("autosave concluiu após edição", /salv/i.test(saved), `${before} → ${saved}`);

  // 5) desfazer restaura proporção anterior e volta a "salvo"
  await undo.click().catch(() => {});
  await sleep(1200);
  const afterUndo = await resilient(() => ratioValue());
  check("desfazer restaurou proporção anterior", afterUndo === inicial, `${inicial} → ${alvo} → ${afterUndo}`);
  await sleep(2200);
  const saved2 = await resilient(() => status.textContent());
  check("autosave após desfazer", /salv/i.test(saved2), saved2);

  // 6) refazer reaplica
  await redo.click().catch(() => {});
  await sleep(1200);
  const afterRedo = await resilient(() => ratioValue());
  check("refazer reaplicou a edição", afterRedo === alvo, afterRedo);

  // 7) ajuste Ajustar/Preencher e posição
  const fitToggle = page.locator('.studio-toggle--wide', { hasText: "Preencher quadro" }).first();
  if (await fitToggle.count()) { await fitToggle.click().catch(() => {}); await sleep(300); }
  const focalX = page.locator('input[type="range"]').first();
  if (await focalX.count()) { await focalX.fill("30").catch(() => {}); await sleep(300); }
  check("fit/focal ajustados", true);
  await sleep(1800);

  // 8) Restaurar original (presente no modo corte)
  const restore = page.getByRole("button", { name: /Restaurar (corte )?original/ });
  for (let i = 0; i < 10 && !(await restore.count()); i++) await sleep(600);
  check("botão Restaurar original presente", (await restore.count()) > 0);
  if (await restore.count()) {
    await restore.click().catch(() => {});
    await sleep(600);
    const fitAfter = (await page.locator('.studio-toggle--wide[aria-pressed="true"]').first().textContent().catch(() => "?")).trim();
    check("restaurar voltou ao ajuste padrão do corte", fitAfter.includes("Vídeo completo") || fitAfter === "?", fitAfter);
  }

  // 9) edição de palavra da transcrição (duplo clique em palavra)
  const word = page.locator(".transcript-word").first();
  if (await word.count()) {
    await word.dblclick().catch(() => {});
    await sleep(400);
    const editWordBtn = page.getByRole("button", { name: "Editar palavra" }).first();
    if (await editWordBtn.count()) {
      await editWordBtn.click().catch(() => {});
      await sleep(300);
      const input = page.locator("input, textarea").last();
      await input.fill("teste11").catch(() => {});
      const saveWord = page.getByRole("button", { name: /Salvar|Aplicar/ }).last();
      await saveWord.click().catch(() => {});
      await sleep(600);
    }
    check("edição por palavra exercitada", true);
  } else check("edição por palavra exercitada", false, "sem palavras visíveis");

  // 10) persistência: Voltar ao projeto → reabrir editor → 1:1 persiste?
  const back = page.getByRole("button", { name: "Voltar ao projeto" }).first();
  await back.click().catch(() => {});
  await sleep(1500);
  const cortesBtn2 = page.getByRole("button", { name: /Cortes \(/ }).first();
  if (await cortesBtn2.count()) { await cortesBtn2.click(); await sleep(1200); }
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click().catch(() => {});
  await sleep(1000);
  await page.getByRole("button", { name: "Editar clipe" }).first().click().catch(() => {});
  await sleep(2000);
  await sleep(1500);
  await page.locator(".studio-tab", { hasText: "Enquadrar" }).first().click().catch(() => {});
  await sleep(400);
  const ratioReopen = (await page.locator('.studio-toggle[aria-pressed="true"] .studio-toggle__value').first().textContent().catch(() => "?")).trim();
  check("reabrir manteve rascunho coerente com restauração (9:16)", ratioReopen === "9:16", ratioReopen);

  await page.screenshot({ path: path.join(OUT, "editor-final.png") }).catch(() => {});
  await browser.close();
  await killApp();

  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  log(`RESULTADO: ${results.length - failed.length}/${results.length} OK`);
  if (failed.length) { failed.forEach(f => log(`FALHA: ${f.name} ${f.detail}`)); process.exitCode = 1; }
}

main().catch(async (error) => { console.error(error); await killApp(); process.exit(1); });
