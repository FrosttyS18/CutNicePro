import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const out = "C:/CutNicePro/docs/reports/evidence/03d";
fs.mkdirSync(out, { recursive: true });
const resuming = process.argv.includes("--resume");
const results = resuming ? JSON.parse(fs.readFileSync(`${out}/runtime-initial.json`, "utf8")).results
  .filter((item) => item.status === "PASS").map((item) => ({ ...item, previouslyPassed: true })) : [];
const errors = [];
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "1424", "--strictPort"], { cwd: "C:/CutNicePro/app", stdio: "ignore" });
let browser;
let page;
let setupFailure = null;
async function check(name, action) {
  try { await action(); results.push({ name, status: "PASS" }); }
  catch (error) { results.push({ name, status: "FAIL", error: String(error) }); throw error; }
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { ready = (await fetch("http://127.0.0.1:1424")).ok; } catch {}
    if (ready) break;
    await sleep(100);
  }
  assert(ready, "Preview indisponível");
  browser = await chromium.launch({ channel: "msedge", headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const generator = await browser.newPage();
  const image = await generator.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 180;
    const drawing = canvas.getContext("2d"); drawing.fillStyle = "#02c2be"; drawing.fillRect(0, 0, 320, 180);
    return canvas.toDataURL("image/jpeg", .8).split(",")[1];
  });
  await generator.close();
  const imageFrame = Buffer.from(image, "base64");
  const encoded = spawnSync("C:/Users/adcka/AppData/Local/ms-playwright/ffmpeg-1013/ffmpeg-win64.exe",
    ["-y", "-f", "image2pipe", "-r", "10", "-vcodec", "mjpeg", "-i", "pipe:0", "-an", "-c:v", "libvpx-vp9", "-f", "webm", `${out}/fixture.webm`],
    { input: Buffer.concat(Array.from({ length: 20 }, () => imageFrame)) });
  assert.equal(encoded.status, 0, String(encoded.stderr));
  const movie = fs.readFileSync(`${out}/fixture.webm`);
  const file = { name: "Fluxo de teste.webm", mimeType: "video/webm", buffer: movie };
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await context.route("http://cnpmedia.localhost/**", (route) => route.fulfill({ body: movie, contentType: "video/webm", headers: { "access-control-allow-origin": "*" } }));
  await context.route("https://www.youtube-nocookie.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<p>Referência YouTube isolada para teste</p>" }));
  await context.route("https://i.ytimg.com/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="9"><rect width="16" height="9" fill="#151515"/></svg>' }));
  await context.addInitScript(() => {
    localStorage.setItem("cnp.sidebar.expanded", "0");
    window.__FLOW_CALLS__ = [];
    if (!localStorage.getItem("qa.projects")) localStorage.setItem("qa.projects", "[]");
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } }, transformCallback: () => 0,
      invoke: async (command, args = {}) => {
        window.__FLOW_CALLS__.push(command);
        const projects = JSON.parse(localStorage.getItem("qa.projects"));
        if (command === "list_projects") return projects;
        if (command === "list_collections") return [];
        if (command === "create_project") {
          const project = { id: `p-${projects.length + 1}`, name: args.name, created_at_ms: Date.now(), updated_at_ms: Date.now(), last_opened_at_ms: null };
          projects.push(project); localStorage.setItem("qa.projects", JSON.stringify(projects)); return project;
        }
        const project = projects.find((item) => item.id === args.id);
        if (command === "rename_project") { if (!project) throw "Projeto não encontrado"; project.name = args.name; }
        if (command === "open_project" && project) project.last_opened_at_ms = Date.now();
        localStorage.setItem("qa.projects", JSON.stringify(projects));
        return project ?? null;
      },
    };
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:1424");
  if (resuming) {
    await page.evaluate(() => {
      localStorage.setItem("qa.projects", JSON.stringify([{ id: "p-1", name: "Projeto renomeado", created_at_ms: 1, updated_at_ms: 2, last_opened_at_ms: null }]));
      localStorage.setItem("cnp.workspace.v1.p-1", JSON.stringify({ version: 1, tool: "editor", transcriptMode: "demo",
        media: { kind: "local", name: "Fluxo de teste.webm", videoId: null, url: null, width: 320, height: 180, duration: 2 },
        settings: { ratio: "9:16", fit: "contain", captionModel: 1, text: "Meu título no vídeo", volume: .4, muted: true, background: "#000000", trimStart: 0, trimEnd: 2 },
        transcript: [{ id: "demo-0", start: 0, end: 2, text: "Texto ajustado manualmente." }] }));
    });
    await page.reload();
    await page.locator(".rail").getByRole("button", { name: "Meus Projetos", exact: true }).click();
    await page.getByTestId("project-card").filter({ hasText: "Projeto renomeado" }).click();
  } else {
  await page.getByTestId("home-create-project").click();
  await check("Arquivo local real é aceito e permite continuar", async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.locator(".upload-screen__source").getByRole("button", { name: "Enviar", exact: true }).click();
    await (await chooser).setFiles(file);
    await page.waitForFunction(() => document.querySelector("dialog video")?.videoWidth === 320);
    assert.equal(await page.getByRole("button", { name: "Continuar para o editor" }).isEnabled(), true);
  });
  await check("Preparação é demonstrativa e cancelamento não cria projeto", async () => {
    await page.getByRole("button", { name: "Continuar para o editor" }).click();
    await page.getByRole("dialog", { name: "Preparando seu projeto" }).waitFor();
    await page.getByText("Demonstração do fluxo", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__FLOW_CALLS__.includes("create_project")), false);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Editar vídeo" }).waitFor();
  });
  await check("Confirmar cria projeto e abre editor sem gerar transcrição real", async () => {
    await page.getByRole("button", { name: "Continuar para o editor" }).click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent.includes("Abrir editor de demonstração") && !button.disabled));
    await page.getByRole("button", { name: "Abrir editor de demonstração" }).click();
    await page.getByTestId("video-editor").waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("qa.projects")).length), 1);
    await page.getByText("Texto de exemplo. Não foi extraído do seu vídeo.", { exact: true }).waitFor();
  });
  await check("Preview, timeline e controles de áudio refletem ajustes", async () => {
    await page.waitForFunction(() => document.querySelector(".editor-stage video")?.videoWidth === 320);
    await page.getByRole("button", { name: "Áudio", exact: true }).click();
    await page.getByRole("slider", { name: "Volume:", exact: false }).fill("0.4");
    assert.equal(await page.locator(".editor-stage video").evaluate((element) => element.volume), .4);
    await page.getByRole("checkbox", { name: "Sem áudio" }).check();
    assert.equal(await page.locator(".editor-stage video").evaluate((element) => element.muted), true);
    await page.getByRole("slider", { name: "Posição do vídeo" }).fill("0.2");
    assert(Math.abs(await page.locator(".editor-stage video").evaluate((element) => element.currentTime) - .2) < .05);
  });
  await check("Texto, enquadramento e salvamento funcionam", async () => {
    await page.getByRole("button", { name: "Texto", exact: true }).click();
    await page.getByRole("textbox", { name: "Seu texto" }).fill("Meu título no vídeo");
    await page.locator(".workspace-preview__text").filter({ hasText: "Meu título no vídeo" }).waitFor();
    await page.getByRole("button", { name: "Enquadrar", exact: true }).click();
    await page.getByRole("combobox", { name: "Proporção", exact: true }).selectOption("9:16");
    await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Configurações salvas" }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("cnp.workspace.v1.p-1")).settings.ratio), "9:16");
  });
  await check("Visão do projeto mostra vídeo e título editável", async () => {
    await page.getByRole("button", { name: "Voltar ao projeto", exact: true }).click();
    await page.getByTestId("project-overview").waitFor();
    await page.getByRole("button", { name: "Editar título do projeto" }).click();
    await page.getByRole("textbox", { name: "Título do projeto", exact: true }).fill("Projeto renomeado");
    await page.getByRole("button", { name: "Salvar título" }).click();
    await page.getByRole("heading", { name: "Projeto renomeado", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("qa.projects"))[0].name), "Projeto renomeado");
  });
  await check("Busca e edição da transcrição demonstrativa funcionam", async () => {
    await page.getByRole("searchbox", { name: "Buscar na transcrição" }).fill("não existe xyz");
    await page.getByText("Nenhum trecho encontrado.", { exact: true }).waitFor();
    await page.getByRole("searchbox", { name: "Buscar na transcrição" }).fill("");
    await page.getByRole("button", { name: "Editar trecho", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Texto do trecho" }).fill("Texto ajustado manualmente.");
    await page.getByRole("button", { name: "Concluir", exact: true }).click();
    await page.getByRole("button", { name: "Salvar alterações do projeto", exact: true }).click();
  });
  await check("Exportação abre configuração sem simular renderização", async () => {
    await page.getByRole("button", { name: "Exportar", exact: true }).click();
    await page.getByRole("dialog", { name: "Exportar vídeo" }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Exportação ainda não disponível" }).isDisabled(), true);
    await page.keyboard.press("Escape");
  });
  }
  await check("Biblioteca e recentes reabrem o projeto persistido", async () => {
    await page.locator(".rail").getByRole("button", { name: "Meus Projetos", exact: true }).click();
    await page.getByTestId("project-card").filter({ hasText: "Projeto renomeado" }).waitFor();
    await page.getByRole("button", { name: "Expandir barra lateral" }).click();
    await page.getByRole("button", { name: "Enviar vídeo", exact: true }).click();
    await page.locator(".upload-recent").getByRole("button", { name: "Projeto renomeado", exact: false }).click();
    await page.getByTestId("project-overview").waitFor();
  });
  await check("Reabrir recupera ajustes e pede reconexão do arquivo", async () => {
    await page.reload();
    await page.locator(".rail").getByRole("button", { name: "Meus Projetos", exact: true }).click();
    await page.getByTestId("project-card").filter({ hasText: "Projeto renomeado" }).click();
    await page.getByText("Reconecte o vídeo deste projeto", { exact: true }).waitFor();
    await page.getByText("Texto ajustado manualmente.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Editar vídeo", exact: true }).click();
    await page.getByRole("button", { name: "Enquadrar", exact: true }).click();
    assert.equal(await page.getByRole("combobox", { name: "Proporção", exact: true }).inputValue(), "9:16");
  });
  await check("Layouts não têm overflow horizontal em 960/1280/1440", async () => {
    for (const width of [960, 1280, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert(await page.locator(".panel-body").evaluate((element) => element.scrollWidth <= element.clientWidth + 1));
    }
  });
  await check("YouTube cria referência e navega pelo fluxo sem afirmar download", async () => {
    await page.locator(".rail").getByRole("button", { name: "Meus Projetos", exact: true }).click();
    if (await page.getByRole("button", { name: "Expandir barra lateral" }).count()) await page.getByRole("button", { name: "Expandir barra lateral" }).click();
    await page.getByRole("button", { name: "Enviar vídeo", exact: true }).click();
    const input = page.locator(".upload-screen__source input[type=text]");
    await input.fill("https://youtu.be/abcdefghijk"); await input.press("Enter");
    await page.getByText("Referência do YouTube", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Continuar para o editor" }).click();
    await page.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((button) => button.textContent.includes("Abrir editor de demonstração") && !button.disabled));
    await page.getByRole("button", { name: "Abrir editor de demonstração" }).click();
    await page.getByTestId("video-editor").waitFor();
    assert.equal(await page.locator(".editor-stage iframe").getAttribute("src"), "https://www.youtube-nocookie.com/embed/abcdefghijk");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("cnp.workspace.v1.p-2")).media.duration), null);
  });
  await check("Console sem erros no escopo", async () => assert.deepEqual(errors, []));
} catch (error) {
  console.error(error); process.exitCode = 1;
  if (!results.some((item) => item.status === "FAIL")) setupFailure = String(error);
  if (page) fs.writeFileSync(`${out}/failure-state.txt`, await page.locator("body").innerText().catch(() => "Estado indisponível"));
} finally {
  await browser?.close(); server.kill();
  const report = { results, errors, setupFailure, passed: results.filter((item) => item.status === "PASS").length,
    failed: results.filter((item) => item.status === "FAIL").length + Number(Boolean(setupFailure)),
    scope: "Edge headless isolado; IPC simulado; mídia WebM real gerada; sem screenshots; motor de IA não executado" };
  fs.writeFileSync(`${out}/runtime.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
