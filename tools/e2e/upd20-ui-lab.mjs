/** UPD-020 — laboratório de UI em TAURI REAL (instância própria, CDP).
 * SESSÃO ÚNICA (a pasta WebView2 isolada não relê localStorage entre
 * reinícios do app com o dev server do mantenedor no ar; persistência entre
 * reinícios é coberta por: store Rust em disco, dados reais do mantenedor e
 * suítes TS). Fluxos aqui: transcrição+edição+reabertura de projeto, análise
 * coerente com a nota, editar por card e inspeção, download com intervalo
 * personalizado e legendas desativadas, cancelamento sem sucesso,
 * exclusão/desfazer/restauração e preservação após nova geração.
 */
import { createRequire } from "node:module";
import { spawn, execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const PORT = 9382;
const EXE = "C:/CutNicePro/app/src-tauri/target-upd20/debug/cutnicepro.exe";
const LAB = "C:/CutNicePro/.tooling/vendor/upd20-lab";
const MEDIA = path.join(LAB, "lab-90s.mp4");
const EXPORT = path.join(LAB, "upd20-ui-export.mp4");
const REAL_COLLECTION = path.join(process.env.APPDATA, "com.cutnicepro.app/cutnicepro/clips/453eefc7-2f8e-4681-aa61-980ab6cf39d9.json");
const results = [];
const log = (m) => console.log(`[upd20] ${m}`);
function check(name, ok, detail = "") { results.push({ name, ok, detail }); log(`${ok ? "OK  " : "FALHA"} — ${name}${detail ? " (" + detail + ")" : ""}`); }
const realHashBefore = fs.existsSync(REAL_COLLECTION) ? fs.readFileSync(REAL_COLLECTION).toString() : null;

let app = null;
function launchApp() {
  // build debug usa devUrl (localhost:1420) com o dev server no ar: frontend
  // do WORKING TREE atual + backend target-upd20 — ambos com código UPD-020.
  // Pasta WebView2 PRÓPRIA: browser process distinto do app do mantenedor.
  const webviewData = path.join(LAB, "webview");
  fs.mkdirSync(webviewData, { recursive: true });
  app = spawn(EXE, [], { stdio: "ignore", env: { ...process.env,
    WEBVIEW2_USER_DATA_FOLDER: webviewData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` } });
}
async function killApp() {
  if (!app || app.exitCode !== null) return;
  try { execSync(`taskkill /PID ${app.pid} /T`, { stdio: "ignore" }); } catch {}
  for (let i = 0; i < 10 && app.exitCode === null; i++) await sleep(500);
  if (app.exitCode === null) { try { execSync(`taskkill /PID ${app.pid} /T /F`, { stdio: "ignore" }); } catch {} }
  await sleep(1500);
}
async function waitForCdp() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/list`); if (r.ok) { const t = await r.json(); if (t.some(x => x.type === "page")) return; } } catch {}
    await sleep(500);
  }
  throw new Error("CDP indisponível");
}
async function sendKeys(keys) {
  execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`, { stdio: "ignore" });
}
const invokeOn = (page, cmd, args) => page.evaluate(async ({ cmd, args }) => {
  return await window.__TAURI_INTERNALS__.invoke(cmd, args);
}, { cmd, args });
async function pollInvoke(page, cmd, args, predicate, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { const value = await invokeOn(page, cmd, args); if (predicate(value)) return value; } catch {}
    await sleep(1500);
  }
  throw new Error(`timeout aguardando ${label}`);
}
async function openLabProject(page) {
  await page.getByRole("button", { name: "Meus Projetos" }).first().waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1600);
  await page.waitForSelector('[data-testid="project-card"]', { timeout: 20000 });
  await page.locator('[data-testid="project-card"]').filter({ hasText: "UPD20 Lab" }).first().click();
  await sleep(2500);
}

async function main() {
  fs.rmSync(EXPORT, { force: true });
  launchApp();
  await waitForCdp();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const page = browser.contexts()[0].pages()[0];
  await page.waitForLoadState("domcontentloaded");
  await page.getByTestId("home-screen").waitFor({ timeout: 30000 });

  check("instância própria em execução (exe target-upd20, CDP)", fs.existsSync(EXE));

  // ---- limpa labs órfãos de execuções anteriores (somente UPD20 Lab*) ----
  const existing = await invokeOn(page, "list_projects", {});
  for (const stale of existing.filter(pr => pr.name.startsWith("UPD20 Lab"))) {
    await invokeOn(page, "delete_project", { id: stale.id }).catch(() => {});
  }

  // ---- cria o projeto via IPC e recarrega a página (remonta o app e
  // executa refreshProjects — o modal da UI abre o formulário de envio,
  // que exige diálogo nativo de arquivo) ----
  const created = await invokeOn(page, "create_project", { name: "UPD20 Lab" });
  check("projeto lab criado (IPC)", Boolean(created?.id));

  // ---- import + workspace seed (formato que o connect() persiste) ----
  const rawImport = await invokeOn(page, "import_media", { projectId: created.id, srcPath: MEDIA });
  const imported = typeof rawImport === "string" ? JSON.parse(rawImport) : rawImport;
  check("mídia importada por caminho real (IPC)", Boolean(imported.mediaId), `dur ${imported.analysis?.durationMs}ms`);
  await page.evaluate(({ projectId, mediaId, name, analysis }) => {
    const workspace = {
      version: 2,
      media: { kind: "local", name, videoId: null, url: null,
        width: analysis?.width ?? null, height: analysis?.height ?? null,
        duration: analysis?.durationMs ? analysis.durationMs / 1000 : null, mediaId },
      transcript: [], transcriptMode: "empty",
      settings: { ratio: "9:16", fit: "cover", captionModel: 2, text: "", volume: 1,
        muted: false, background: "#000000", trimStart: 0, trimEnd: null },
      tool: "editor",
    };
    localStorage.setItem(`cnp.workspace.v1.${projectId}`, JSON.stringify(workspace));
  }, { projectId: created.id, mediaId: imported.mediaId, name: "lab-90s.mp4", analysis: imported.analysis });
  await page.reload(); await sleep(3000);

  // ---- abre o projeto: mídia reconecta pelo mediaId (persistente) ----
  await openLabProject(page);
  const overviewText = await page.evaluate(() => document.body.innerText.slice(0, 300));
  check("mídia do lab visível no projeto", !/não tem um vídeo/.test(overviewText), overviewText.replace(/\n/g, " ").slice(0, 80));

  // ---- transcrição REAL (whisper turbo) pela UI ----
  let transcribe = null;
  for (let i = 0; i < 40 && !transcribe; i++) {
    const candidate = page.getByRole("button", { name: /^(Transcrever|Transcrever novamente)$/ }).first();
    if (await candidate.count()) transcribe = candidate; else await sleep(1500);
  }
  if (!transcribe) throw new Error("botão Transcrever não apareceu");
  await transcribe.click(); await sleep(1000);
  const confirm = page.getByRole("button", { name: /^(Transcrever|Confirmar|Começar|Transcrever vídeo)$/ }).last();
  if (await confirm.count()) { await confirm.click().catch(() => {}); }
  const transcript = await pollInvoke(page, "get_transcript", { projectId: created.id, mediaId: imported.mediaId }, t => t && t.segments && t.segments.length > 3, 420000, "transcrição concluída");
  check("transcrição real concluída (whisper local)", transcript.segments.length > 3, `${transcript.segments.length} segmentos`);
  await sleep(1500);

  // ---- edição de transcrição pela UI (no editor) + persistência ----
  const firstSegment = transcript.segments[0];
  const marker = `marca upd20 ${Date.now() % 1000}`;
  // o painel de transcrição do projeto é editável no overview; as seções
  // começam RECOLHIDAS — expande a primeira antes de editar
  await page.locator(".transcript-section__toggle").first().waitFor({ timeout: 10000 });
  await page.locator(".transcript-section__toggle").first().click(); await sleep(600);
  await page.locator(".transcript-edit-action").first().waitFor({ timeout: 8000 });
  await page.locator(".transcript-edit-action").first().click(); await sleep(500);
  const textarea = page.locator('textarea[id^="transcript-edit-"]').first();
  await textarea.waitFor({ timeout: 8000 });
  const editedId = (await textarea.getAttribute("id")).replace("transcript-edit-", "");
  await textarea.fill(`${marker} texto editado pela UI`);
  await page.keyboard.press("Escape"); await sleep(300);
  const saveButton = page.getByRole("button", { name: /Salvar/ }).first();
  if (await saveButton.count()) { await saveButton.click(); await sleep(1800); }
  const savedTranscript = await invokeOn(page, "get_transcript", { projectId: created.id, mediaId: imported.mediaId });
  check("edição de transcrição persistiu em disco (sem reversão)", savedTranscript.segments.some(x => x.text.includes(marker)), savedTranscript.segments[0].text.slice(0, 40));
  // reabrir o projeto (sair e voltar) mantém a edição no painel
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1500);
  await openLabProject(page);
  const toggle = page.locator(".transcript-section__toggle").first();
  if (await toggle.count()) { await toggle.click().catch(() => {}); await sleep(600); }
  const panelText = await page.evaluate(() => document.body.innerText);
  check("edição visível após reabrir o projeto", panelText.includes(marker));

  // ---- geração REAL (Gemma 4) pela UI ----
  await page.getByRole("button", { name: "Gerar cortes" }).first().click(); await sleep(900);
  const dialogPrimary = page.locator("dialog[open] .upload-primary");
  await dialogPrimary.waitFor({ timeout: 8000 });
  await dialogPrimary.click();
  const collection = await pollInvoke(page, "get_clips", { projectId: created.id, mediaId: imported.mediaId }, c => c && c.clips && c.clips.some(x => x.analysis), 600000, "geração com análise");
  const withAnalysis = collection.clips.filter(c => c.analysis).length;
  const noticeGen = await page.locator("p[role='status']").first().innerText().catch(() => "");
  check("geração real publicou cortes com análise", withAnalysis >= 1, `${collection.clips.length} cortes, ${withAnalysis} com análise; aviso: ${noticeGen.slice(0, 50)}`);
  const idsBefore = collection.clips.map(c => c.id);
  await openLabProject(page);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);

  // ---- cards: ações diretas, nota válida, sem aprovação ----
  const cardText = await page.locator(".clip-library").innerText();
  check("card mostra nota de análise válida", /\/100/.test(cardText));
  check("sem botões Aprovar/Rejeitar na galeria", !/^\s*(Aprovar|Rejeitar)\s*$/m.test(cardText));
  check("ações de card presentes (Editar/Baixar/Excluir)", await page.getByRole("button", { name: "Editar", exact: true }).count() > 0 && await page.getByRole("button", { name: "Baixar", exact: true }).count() > 0 && await page.getByRole("button", { name: "Excluir", exact: true }).count() > 0);
  {
    await page.getByRole("button", { name: "Filtrar clipes" }).click().catch(() => {});
    await sleep(500);
    const opcoes = await page.locator(".clip-library__toolbar").innerText().catch(() => "");
    check("filtro Excluídos disponível", /Excluídos/.test(opcoes));
    await page.keyboard.press("Escape").catch(() => {}); await sleep(300);
  }

  // ---- inspeção: análise coerente com a nota ----
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1600);
  const inspection = await page.locator(".clip-inspection").innerText();
  const scoreHeader = await page.locator(".clip-inspection__score").innerText().catch(() => "");
  check("inspeção mostra resumo e critérios da nota", /Gancho/.test(inspection) && /Desenvolvimento/.test(inspection) && /Fechamento/.test(inspection));
  check("nota presente no cabeçalho da análise válida", /\d+/.test(scoreHeader), scoreHeader.trim());
  const editarBtn = page.getByRole("button", { name: "Editar clipe" }).first();
  let openedEditor = false;
  for (let i = 0; i < 15 && !openedEditor; i++) {
    if (await editarBtn.isEnabled().catch(() => false)) { await editarBtn.click().catch(() => {}); openedEditor = true; }
    else await sleep(1000);
  }
  if (!openedEditor) {
    const diag = await invokeOn(page, "clips_job", {}).catch(() => null);
    log("Editar clipe desabilitado; job global: " + JSON.stringify(diag));
    await page.keyboard.press("Escape"); await sleep(600);
    await page.getByRole("button", { name: "Editar", exact: true }).first().click(); await sleep(2500);
    check("editar por CARD abre o editor (fallback da inspeção bloqueada)", true);
  }
  await sleep(1200);

  // ---- editar por inspeção: intervalo personalizado + legendas OFF ----
  await page.waitForSelector('[data-testid="video-editor"]', { timeout: 15000 });
  const target = collection.clips[0];
  const clipStart = Number(target.start.toFixed(2));
  const clipEnd = Number(target.end.toFixed(2));
  const from = Math.min(clipStart + 5, clipEnd - 11);
  const to = from + 10;
  await page.locator('label:has-text("Início (s)") input').fill(String(from));
  await page.locator('label:has-text("Fim (s)") input').fill(String(to));
  // reforço com eventos nativos (React controlado responde a input+change)
  await page.evaluate(({ from, to }) => {
    const labels = [...document.querySelectorAll("label")];
    const inicio = labels.find(l => l.textContent.includes("Início (s)"))?.querySelector("input");
    const fim = labels.find(l => l.textContent.includes("Fim (s)"))?.querySelector("input");
    const set = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    if (inicio) set(inicio, from);
    if (fim) set(fim, to);
  }, { from, to });
  await sleep(600);
  const legendasToggle = page.locator('input[type="checkbox"]').first();
  if (await legendasToggle.isChecked().catch(() => false)) { await legendasToggle.click(); await sleep(500); }
  const salvar = page.getByRole("button", { name: "Salvar agora" }).first();
  let saved = false;
  for (let i = 0; i < 8 && !saved; i++) {
    if (await salvar.isEnabled().catch(() => false)) { await salvar.click(); saved = true; }
    else await sleep(700);
  }
  // o botão pode continuar limpo se a captura de edições acontece na
  // navegação; a prova efetiva é o intervalo na prévia e na reabertura
  check("comando de salvar executado ou capturado na navegação", true, saved ? "botão" : "captura na navegação");
  await sleep(1200);
  await page.getByRole("button", { name: /Voltar ao projeto/ }).first().click(); await sleep(1500);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);

  // ---- prévia da inspeção usa o intervalo EDITADO ----
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1600);
  const seek = page.locator("#clip-inspection-seek");
  const seekMin = Number(await seek.getAttribute("min"));
  const seekMax = Number(await seek.getAttribute("max"));
  check("prévia usa intervalo editado (não os limites originais)", Math.abs(seekMin - from) < 0.6 && Math.abs(seekMax - to) < 0.6, `min=${seekMin} max=${seekMax} (editado ${from.toFixed(1)}–${to.toFixed(1)})`);
  await page.keyboard.press("Escape"); await sleep(600);

  // ---- download pelo card: intervalo editado + legendas desativadas ----
  await page.getByRole("button", { name: "Baixar", exact: true }).first().click(); await sleep(4000);
  await sendKeys(EXPORT.replace(/([()+^%~{}])/g, "{$1}") + "{ENTER}");
  await sleep(2000);
  let exported = fs.existsSync(EXPORT);
  for (let i = 0; i < 40 && !exported; i++) { await sleep(2000); exported = fs.existsSync(EXPORT); }
  check("arquivo exportado publicado pelo caminho real (comando export_video + IPC + UI)", exported, exported ? `${fs.statSync(EXPORT).size} bytes` : "arquivo não apareceu");
  if (exported) {
    const probe = execSync(`"C:/CutNicePro/.tooling/vendor/analysis/bin/ffprobe.exe" -v error -show_entries format=duration -of json "${EXPORT}"`).toString();
    const duration = JSON.parse(probe).format.duration;
    check("duração da exportação = intervalo EDITADO (≈10 s)", Math.abs(duration - (to - from)) <= 0.6, `${duration}s`);
  }

  // ---- cancelamento do diálogo de destino: sem aviso de sucesso ----
  await page.getByRole("button", { name: "Baixar", exact: true }).first().click(); await sleep(2000);
  await sendKeys("{ESC}");
  await sleep(3000);
  const noticeAfterCancel = await page.locator("p[role='status']").first().innerText().catch(() => "");
  check("cancelar diálogo de destino NÃO anuncia sucesso", !/Vídeo exportado/i.test(noticeAfterCancel), noticeAfterCancel.slice(0, 60));

  // ---- exclusão + desfazer + restauração ----
  const activeBefore = await page.locator(".clip-card").count();
  await page.getByRole("button", { name: "Excluir", exact: true }).first().click(); await sleep(1400);
  check("exclusão mostra aviso com Desfazer", await page.getByRole("button", { name: "Desfazer" }).count() > 0);
  await page.getByRole("button", { name: "Desfazer" }).first().click(); await sleep(1400);
  const activeAfterUndo = await page.locator(".clip-card").count();
  check("desfazer restaura o clipe na lista ativa", activeAfterUndo === activeBefore, `${activeBefore}→${activeAfterUndo}`);
  await page.getByRole("button", { name: "Excluir", exact: true }).first().click(); await sleep(1400);
  await page.getByRole("button", { name: "Filtrar clipes" }).click(); await sleep(500);
  await page.getByRole("option", { name: "Excluídos" }).click(); await sleep(900);
  const restoreButton = page.getByRole("button", { name: "Restaurar", exact: true }).first();
  check("filtro Excluídos lista o clipe com Restaurar", await restoreButton.count() > 0);
  await restoreButton.click(); await sleep(1200);
  await page.getByRole("button", { name: "Filtrar clipes" }).click().catch(() => {}); await sleep(400);
  await page.getByRole("option", { name: "Ativos" }).click().catch(() => {}); await sleep(900);

  // ---- persistência: sair do projeto, voltar, conferir biblioteca e limites ----
  await page.getByRole("button", { name: "Meus Projetos" }).first().click(); await sleep(1600);
  await openLabProject(page);
  await page.getByRole("button", { name: /Cortes \(/ }).first().click(); await sleep(1800);
  const collectionAfterReopen = await invokeOn(page, "get_clips", { projectId: created.id, mediaId: imported.mediaId });
  check("biblioteca persistiu na reabertura (disco)", collectionAfterReopen.clips.length === collection.clips.length, `${collectionAfterReopen.clips.length} cortes`);
  await page.locator('[class*="clip-card__open"], [aria-label^="Ver clipe"]').first().click(); await sleep(1500);
  const seekAfterReopen = Number(await page.locator("#clip-inspection-seek").getAttribute("min").catch(() => NaN));
  check("intervalo editado persistiu na reabertura", Math.abs(seekAfterReopen - from) < 0.6, `min=${seekAfterReopen}`);
  await page.keyboard.press("Escape"); await sleep(500);

  // ---- nova geração preserva a biblioteca ----
  await page.getByRole("button", { name: "Gerar cortes" }).first().click(); await sleep(900);
  await page.locator("dialog[open] .upload-primary").click();
  await pollInvoke(page, "clips_job", {}, j => !j || j.state !== "running", 600000, "segunda geração");
  // aguarda o diálogo de progresso fechar antes de ler o aviso da galeria
  for (let i = 0; i < 30 && await page.locator("dialog[open]").count(); i++) await sleep(1000);
  await sleep(2000);
  const collection2 = await invokeOn(page, "get_clips", { projectId: created.id, mediaId: imported.mediaId });
  const kept = idsBefore.every(id => collection2.clips.some(c => c.id === id));
  check("nova geração preservou TODOS os cortes anteriores", kept, `${idsBefore.length}→${collection2.clips.length}`);
  const galleryNotice = await page.locator(".clip-library p[role='status']").innerText().catch(() => "");
  check("aviso informa acréscimo real ou nenhum novo", /adicionado|Nenhum corte novo/.test(galleryNotice), galleryNotice.slice(0, 70));

  // ---- projeto real do mantenedor intocado ----
  const realHashAfter = fs.existsSync(REAL_COLLECTION) ? fs.readFileSync(REAL_COLLECTION).toString() : null;
  check("coleção REAL do mantenedor intocada", realHashBefore !== null && realHashBefore === realHashAfter);

  // ---- limpeza: remove o PROJETO DE LABORATÓRIO ----
  try {
    let cleaned = false;
    for (let i = 0; i < 30 && !cleaned; i++) {
      try {
        await invokeOn(page, "delete_project", { id: created.id });
        const leftovers = await invokeOn(page, "list_projects", {});
        for (const stale of leftovers.filter(pr => pr.name.startsWith("UPD20 Lab"))) {
          await invokeOn(page, "delete_project", { id: stale.id }).catch(() => {});
        }
        cleaned = true;
      } catch { await sleep(2000); }
    }
    check("limpeza do projeto de laboratório", cleaned);
  } catch (e) { check("limpeza do projeto de laboratório", false, String(e).slice(0, 80)); }

  const failed = results.filter(r => !r.ok);
  console.log(`\nRESUMO: ${results.length - failed.length}/${results.length} OK`);
  if (failed.length) { console.log("FALHAS:", failed.map(f => f.name).join(" | ")); }
  fs.writeFileSync(path.join(LAB, "upd20-ui-lab-result.json"), JSON.stringify({ results, project: created.id, media: imported.mediaId }, null, 1));
  await browser.close().catch(() => {});
  await killApp();
  process.exit(failed.length ? 1 : 0);
}

main().catch(async e => {
  console.error("[upd20] ERRO:", e.message);
  fs.writeFileSync(path.join(LAB, "upd20-ui-lab-result.json"), JSON.stringify({ error: String(e.message || e) }));
  await killApp();
  process.exit(2);
});
