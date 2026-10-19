import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const out = "C:/CutNicePro/docs/reports/evidence/03e";
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

  if (!resuming) {
  await page.locator('.rail').getByRole('button', { name: 'Meus Projetos', exact: true }).click();
  await check('Novo projeto abre envio sem criar registro vazio', async () => {
    await page.getByTestId('new-project-card').click();
    await page.getByTestId('upload-screen').waitFor();
    assert.equal(await page.evaluate(() => window.__FLOW_CALLS__.filter(x => x === 'create_project').length), 0);
    assert.equal(await page.locator('dialog[open]').count(), 0);
  });
  await check('Envio geral abre projeto com vídeo e transcrição, sem ferramenta intermediária', async () => {
    await page.locator('.upload-screen__source input[type=file]').setInputFiles(file);
    await page.getByTestId('project-overview').waitFor();
    assert.equal(await page.getByTestId('video-editor').count(), 0);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('.project-reconnect').count(), 0);
    assert.equal(await page.locator('.transcript-panel').count(), 1);
    await page.waitForFunction(() => document.querySelector('.workspace-preview video')?.videoWidth === 320);
  });
  await check('Título usa caneta adjacente e renomeação persiste', async () => {
    const edit=page.getByRole('button',{name:'Editar título do projeto'});
    assert.equal(await edit.innerText(), '');
    assert.equal(await edit.locator('svg').count(),1);
    await edit.click();
    await page.getByRole('textbox',{name:'Título do projeto'}).fill('Vídeo importado');
    await page.getByRole('button',{name:'Salvar título',exact:true}).click();
    await page.getByRole('heading',{name:'Vídeo importado',exact:true}).waitFor();
  });
  await check('Visão do projeto tem prévia limitada em ultrawide', async () => {
    for(const [width,height] of [[3440,1440],[2560,1080],[1920,1080]]) {
      await page.setViewportSize({width,height});
      const sizes=await page.evaluate(()=>({video:document.querySelector('.workspace-preview').getBoundingClientRect().height,body:document.querySelector('.panel-body').clientWidth,scroll:document.querySelector('.panel-body').scrollWidth}));
      assert(sizes.video <= height*.53,JSON.stringify(sizes));
      assert(sizes.scroll <= sizes.body+1);
    }
  });
  await check('Editor mantém vídeo e timeline dentro da janela, incluindo ultrawide', async () => {
    await page.getByRole('button',{name:'Editar vídeo',exact:true}).click();
    await page.getByTestId('video-editor').waitFor();
    for(const [width,height] of [[3440,1440],[2560,1080],[1920,1080],[1440,900],[1280,720],[1024,768]]) {
      await page.setViewportSize({width,height});
      const sizes=await page.evaluate(()=>{
        const body=document.querySelector('.panel-body'), timeline=document.querySelector('.editor-timeline').getBoundingClientRect(),video=document.querySelector('.workspace-preview').getBoundingClientRect();
        return {w:body.clientWidth,sw:body.scrollWidth,h:body.clientHeight,sh:body.scrollHeight,bottom:timeline.bottom,videoHeight:video.height,window:innerHeight};
      });
      assert(sizes.sw <= sizes.w+1,JSON.stringify({width,...sizes}));
      assert(sizes.sh <= sizes.h+1,JSON.stringify({width,...sizes}));
      assert(sizes.bottom <= height && sizes.videoHeight>50,JSON.stringify({width,...sizes}));
    }
  });
  await check('Timeline extrai 12 miniaturas reais e mantém seek/zoom funcionais', async () => {
    await page.waitForFunction(()=>document.querySelectorAll('.timeline-filmstrip img').length===12);
    const seek=page.getByRole('slider',{name:'Posição do vídeo',exact:true});
    await seek.fill('1');
    await page.waitForFunction(()=>Math.abs(document.querySelector('.workspace-preview video').currentTime-1)<.1);
    await page.getByRole('slider',{name:'Zoom da linha do tempo'}).fill('3');
    assert(await page.locator('.timeline-scroll').evaluate(e=>e.scrollWidth>e.clientWidth));
    await page.getByRole('slider',{name:'Zoom da linha do tempo'}).fill('1');
  });
  await check('Arrastar no cabeçalho não seleciona a interface; campos continuam editáveis',async()=>{
    const box=await page.locator('.editor-header h1').boundingBox();
    await page.mouse.move(box.x,box.y+10);await page.mouse.down();await page.mouse.move(box.x+200,box.y+10,{steps:10});await page.mouse.up();
    assert.equal(await page.evaluate(()=>getSelection().toString()),'');
    assert.equal(await page.locator('.editor-header h1').evaluate(e=>getComputedStyle(e).userSelect),'none');
    assert.equal(await page.locator('.transcript-panel input').evaluate(e=>getComputedStyle(e).userSelect),'text');
  });
  } else {
    await page.getByTestId('home-create-project').click();
    await page.locator('.upload-screen__source input[type=file]').setInputFiles(file);
    await page.getByTestId('project-overview').waitFor();
    await page.getByRole('button',{name:'Editar título do projeto'}).click();
    await page.getByRole('textbox',{name:'Título do projeto'}).fill('Vídeo importado');
    await page.getByRole('button',{name:'Salvar título',exact:true}).click();
    await page.getByRole('heading',{name:'Vídeo importado',exact:true}).waitFor();
    await page.getByRole('button',{name:'Editar vídeo',exact:true}).click();
  }
  await check('Layout compacto mantém controles acessíveis sem overflow horizontal',async()=>{
    for(const [width,height] of [[960,720],[768,800],[600,700]]) {
      await page.setViewportSize({width,height});
      assert(await page.locator('.panel-body').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
    }
    await page.setViewportSize({width:1440,height:900});
    assert.equal(await page.getByRole('button',{name:'Salvar alterações',exact:true}).isDisabled(),true);
    await page.getByRole('button',{name:'Voltar ao projeto'}).click();
  });
  await check('Biblioteca e recentes reabrem o vídeo; não há formulário de adicionar vídeo',async()=>{
    await page.locator('.rail').getByRole('button',{name:'Meus Projetos',exact:true}).click();
    await page.getByTestId('project-card').filter({hasText:'Vídeo importado'}).click();
    await page.getByTestId('project-overview').waitFor();
    assert.equal(await page.locator('.project-reconnect').count(),0);
    await page.locator('.rail').getByRole('button',{name:'Meus Projetos',exact:true}).click();
    await page.getByTestId('new-project-card').click();
    assert.equal(await page.locator('.upload-project').count()>0,true);
  });
  await check('Falha real da criação permite tentar novamente sem timers de preparação',async()=>{
    await page.evaluate(()=>{const invoke=window.__TAURI_INTERNALS__.invoke;let fail=true;window.__TAURI_INTERNALS__.invoke=async(command,args)=>{if(command==='create_project'&&fail){fail=false;throw new Error('Falha de teste ao criar projeto');}return invoke(command,args);};});
    await page.locator('.upload-screen__source input[type=file]').setInputFiles({...file,name:'Segundo vídeo.webm'});
    await page.getByRole('dialog',{name:'Não foi possível importar'}).waitFor();
    assert.equal(await page.locator('.preparation-stages').count(),0);
    await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
    await page.getByTestId('project-overview').waitFor();
  });
  await check('Reinício pede apenas reconexão do original, sem criar pasta ou projeto extra',async()=>{
    await page.reload();
    await page.locator('.rail').getByRole('button',{name:'Meus Projetos',exact:true}).click();
    await page.getByTestId('project-card').filter({hasText:'Segundo vídeo'}).click();
    await page.getByText('Reconectar arquivo original',{exact:true}).waitFor();
    const count=await page.evaluate(()=>JSON.parse(localStorage.getItem('qa.projects')).length);
    assert.equal(count,2);
  });
  await check('Console sem erros inesperados',async()=>assert.deepEqual(errors,[]));
} catch(error) {setupFailure=String(error);process.exitCode=1;}
finally {
  fs.writeFileSync(out+'/runtime.json',JSON.stringify({results,errors,setupFailure},null,2));
  console.log(JSON.stringify({results,errors,setupFailure},null,2));
  await browser?.close();server.kill();
}
