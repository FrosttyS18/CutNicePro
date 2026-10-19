import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const out = "C:/CutNicePro/docs/reports/evidence/03f";
fs.mkdirSync(out, { recursive: true });
const resuming = false;
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
  const movie = fs.readFileSync("C:/CutNicePro/docs/reports/evidence/03d/fixture.webm");
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


  await page.getByTestId('home-create-project').click();
  await page.locator('.upload-screen__source input[type=file]').setInputFiles(file);
  await page.getByTestId('project-overview').waitFor();
  await page.getByRole('button',{name:'Editar vídeo',exact:true}).click();
  await page.getByTestId('video-editor').waitFor();
  await check('Legendas abre modal com dez opções visuais e seleção funcional',async()=>{
    await page.getByRole('button',{name:'Legendas',exact:true}).click();
    const modal=page.getByRole('dialog',{name:'Estilos de legenda'});
    await modal.waitFor();
    assert.equal(await modal.getByRole('radio').count(),10);
    await modal.getByText('Modelo 3',{exact:true}).click();
    assert.equal(await modal.getByRole('radio').nth(3).isChecked(),true);
    await page.keyboard.press('Escape');
    await modal.waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Legendas');
    await page.getByRole('button',{name:'Salvar alterações',exact:true}).click();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cnp.workspace.v1.p-1')).settings.captionModel),3);
  });
  await check('Cursor da timeline responde ao mouse e teclado sem contorno no bloco',async()=>{
    const slider=page.getByRole('slider',{name:'Posição do vídeo',exact:true});
    await slider.click({position:{x:100,y:20}});
    await page.waitForFunction(()=>document.querySelector('.workspace-preview video').currentTime>0);
    const before=Number(await slider.inputValue());
    await page.keyboard.press('ArrowRight');
    assert(Number(await slider.inputValue())>before);
    assert.equal(await page.locator('.timeline-seek').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
    const handle=await page.locator('.timeline-track i').evaluate(e=>({width:getComputedStyle(e,'::before').width,height:getComputedStyle(e,'::before').height,focus:getComputedStyle(e,'::before').boxShadow}));
    assert.equal(handle.width,'10px');assert.equal(handle.height,'20px');assert.notEqual(handle.focus,'none');
  });
  await check('Modal e timeline cabem em janela estreita e ultrawide',async()=>{
    for(const [width,height] of [[600,700],[1440,900],[3440,1440]]){
      await page.setViewportSize({width,height});
      await page.getByRole('button',{name:'Legendas',exact:true}).click();
      const modal=page.getByRole('dialog',{name:'Estilos de legenda'});
      const bounds=await modal.boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
      await modal.getByRole('button',{name:'Concluir',exact:true}).click();
      assert(await page.locator('.panel-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    }
  });
  await check('Console sem erros',async()=>assert.deepEqual(errors,[]));
} catch(error){setupFailure=String(error);process.exitCode=1;}
finally {
  fs.writeFileSync(out+'/runtime.json',JSON.stringify({results,errors,setupFailure},null,2));
  console.log(JSON.stringify({results,errors,setupFailure},null,2));
  await browser?.close();server.kill();
}
