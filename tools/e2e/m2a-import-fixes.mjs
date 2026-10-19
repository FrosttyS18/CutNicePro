import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/CutNicePro/.tooling/playwright/node_modules/playwright");
const out = "C:/CutNicePro/docs/reports/evidence/m2a-fix";
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
  await context.route("http://cnplocal.localhost/**", route => route.fulfill({body:movie,contentType:"video/webm",headers:{"access-control-allow-origin":"*"}}));
  await context.addInitScript(() => {
    localStorage.setItem("cnp.sidebar.expanded","0");
    const legacy={id:"legacy",name:"C:\\Users\\adcka\\Downloads\\nome truncado",created_at_ms:1,updated_at_ms:1,last_opened_at_ms:null};
    if(!localStorage.getItem("qa.projects")) localStorage.setItem("qa.projects",JSON.stringify([legacy]));
    if(!localStorage.getItem("cnp.workspace.v1.legacy")) localStorage.setItem("cnp.workspace.v1.legacy",JSON.stringify({version:2,media:{kind:"local",name:"Título original.webm",videoId:null,url:null,width:320,height:180,duration:2,mediaId:"legacy-media"},transcript:[],transcriptMode:"empty",tool:"editor",settings:{ratio:"16:9",fit:"contain",captionModel:0,text:"",volume:1,muted:false,background:"#000000",trimStart:0,trimEnd:null}}));
    window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener:()=>{}};
    window.__CALLS__=[];window.__listeners__=[];window.__callbacks__={};let sequence=0;
    window.__emit__=(event,payload)=>{for(const item of [...window.__listeners__])if(item.event===event)window.__callbacks__[item.handler]?.({event,id:item.id,payload});};
    window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:"main"},currentWebview:{label:"main"}},
      transformCallback:fn=>{const id=++sequence;window.__callbacks__[id]=fn;return id;},
      unregisterCallback:id=>delete window.__callbacks__[id],
      invoke:async(command,args={})=>{
        window.__CALLS__.push({command,args});
        if(command==="plugin:event|listen"){const id=++sequence;window.__listeners__.push({...args,id});return id;}
        if(command==="plugin:event|unlisten"){window.__listeners__=window.__listeners__.filter(item=>item.id!==args.eventId);return;}
        if(command==="plugin:dialog|open")return window.__pick__;
        const projects=JSON.parse(localStorage.getItem("qa.projects"));
        if(command==="list_projects")return projects;
        if(command==="list_collections")return [];
        if(command==="create_project"){const p={id:"p-"+projects.length,name:args.name,created_at_ms:Date.now(),updated_at_ms:Date.now(),last_opened_at_ms:null};projects.push(p);localStorage.setItem("qa.projects",JSON.stringify(projects));return p;}
        if(command==="open_project")return projects.find(p=>p.id===args.id);
        if(command==="import_media"){
          window.__emit__("import://progress",{jobId:"job-test",bytesCopied:1048576,totalBytes:2097152});
          await new Promise(resolve=>setTimeout(resolve,600));
          if(window.__failImport__){window.__failImport__=false;throw new Error("Falha controlada na importação");}
          return JSON.stringify({mediaId:"m-"+args.projectId,sha256:"a".repeat(64),ext:"webm",sizeBytes:200,originalName:args.srcPath.split(/[/\\]/).pop(),createdAtMs:1,projectIds:[args.projectId],analysis:{durationMs:2000,width:320,height:180,videoCodec:"vp9",audioCodec:null,hasAudio:false,fps:10},unavailable:false});
        }
        return null;
      }};
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:1424");



  if(!resuming) {
  await check('Nome legado usa apenas o arquivo sem modificar título salvo',async()=>{
    await page.locator('.rail').getByRole('button',{name:'Meus Projetos',exact:true}).click();
    await page.getByTestId('project-card').filter({hasText:'Título original'}).waitFor();
    assert((await page.evaluate(()=>JSON.parse(localStorage.getItem('qa.projects'))[0].name)).includes('C:'));
    await page.getByTestId('new-project-card').click();
  });
  await check('Link YouTube informa indisponibilidade e não cria projeto',async()=>{
    const form=page.locator('.upload-screen__source');
    await form.getByRole('textbox').fill('https://youtu.be/abcdefghijk');
    await form.getByRole('button',{name:'Enviar',exact:true}).click();
    await form.getByRole('alert').filter({hasText:'ainda não está disponível'}).waitFor();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('qa.projects')).length),1);
    assert.equal(await page.locator('iframe').count(),0);
    await form.getByRole('textbox').fill('');
  });
  } else {
    await page.locator('.rail').getByRole('button',{name:'Meus Projetos',exact:true}).click();
    await page.getByTestId('new-project-card').click();
  }
  await check('Importação nativa usa nome limpo, progresso real repassado e player local',async()=>{
    await page.evaluate(()=>window.__pick__='C:\Users\adcka\Downloads\Vídeo 1.2.webm');
    await page.locator('.upload-screen__source').getByRole('button',{name:'Enviar',exact:true}).click();
    await page.getByText('Copiando… 1.0 MB de 2.0 MB',{exact:true}).waitFor();
    await page.getByTestId('project-overview').waitFor();
    assert.equal(await page.locator('.project-title h1').innerText(),'Vídeo 1.2',JSON.stringify(await page.evaluate(()=>window.__CALLS__)));
    await page.waitForFunction(()=>document.querySelector('.workspace-preview video')?.videoWidth===320);
    assert.equal(await page.locator('iframe').count(),0);
    await page.locator('.rail').getByRole('button',{name:'Meus Projetos',exact:true}).click();
    await page.getByTestId('new-project-card').click();
  });
  await check('Falha de importação fica visível até fechar, sem sucesso falso',async()=>{
    await page.evaluate(()=>{window.__failImport__=true;window.__emit__('tauri://drag-drop',{paths:[['C:','Users','adcka','Downloads','Outro vídeo.webm'].join(String.fromCharCode(92))]});});
    await page.getByRole('dialog',{name:'Não foi possível importar'}).waitFor();
    await page.getByRole('alert').filter({hasText:'Falha controlada'}).waitFor();
    assert.equal(await page.getByTestId('project-overview').count(),0);
    await page.getByRole('button',{name:'Fechar janela'}).click();
    assert.equal(await page.locator('dialog[open]').count(),0);
  });
  await check('Drop em ferramenta importa uma só vez e preserva a opção escolhida',async()=>{
    const count=await page.evaluate(()=>window.__CALLS__.filter(c=>c.command==='create_project').length);
    await page.getByRole('button',{name:'Iniciar Legendas IA'}).click();
    await page.evaluate(()=>window.__emit__('tauri://drag-drop',{paths:[['C:','Users','adcka','Downloads','Legendas.webm'].join(String.fromCharCode(92))]}));
    await page.getByTestId('project-overview').waitFor();
    assert.equal(await page.evaluate(()=>window.__CALLS__.filter(c=>c.command==='create_project').length),count+1);
    const tool=await page.evaluate(()=>{const list=JSON.parse(localStorage.getItem('qa.projects'));return JSON.parse(localStorage.getItem('cnp.workspace.v1.'+list.at(-1).id)).tool;});
    assert.equal(tool,'captions');
  });
  await check('Console sem erros inesperados',async()=>assert.deepEqual(errors,[]));
} catch(error){setupFailure=String(error);if(page)fs.writeFileSync(out+'/failure-state.txt',await page.locator('body').innerText());process.exitCode=1;}
finally {fs.writeFileSync(out+'/runtime.json',JSON.stringify({results,errors,setupFailure},null,2));console.log(JSON.stringify({results,errors,setupFailure},null,2));await browser?.close();server.kill();}
