import { act, useState } from "react";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, expect, it, vi } from "vitest";
import { EditorInspector } from "../components/editor/EditorInspector";
import { InspectorNumberField } from "../components/editor/InspectorNumberField";
import { EditorAction } from "../components/editor/EditorAction";
import { CompositionPlacementControls } from "../components/editor/CompositionPlacementControls";
import { defaultEditorSettings } from "../lib/workspace";
import { defaultSplitScreen } from "../lib/split-screen";
import { reactHost } from "./react-host";

const workspaceCss=readFileSync(new URL("../screens/workspace.css",import.meta.url),"utf8");
const refinementCss=readFileSync(new URL("../screens/editor-refinement.css",import.meta.url),"utf8");
const actionCss=readFileSync(new URL("../components/editor/editor-controls.css",import.meta.url),"utf8");
const reframeCss=readFileSync(new URL("../components/editor/reframe-controls.css",import.meta.url),"utf8");

const bootstrap = await vi.hoisted(async () => {
  const { Window } = await import("happy-dom");
  const environment = new Window({ url:"http://localhost" });
  vi.stubGlobal("window",environment);vi.stubGlobal("document",environment.document);
  return environment;
});
let view: Awaited<ReturnType<typeof reactHost>> | undefined;
afterEach(async()=>{await view?.close();view=undefined;});
afterAll(async()=>{await bootstrap.happyDOM.cancelAsync();vi.unstubAllGlobals();});

function styles(order:"before"|"after"="after") {
  const root=document.documentElement.style;
  root.setProperty("--ink","#f5f5f5");root.setProperty("--sh-dim","#a0a0a0");root.setProperty("--sh-surface","#161616");root.setProperty("--sh-accent","#02c2be");
  const element=document.createElement("style");
  element.textContent=order==="before"?reframeCss+workspaceCss+refinementCss+actionCss:workspaceCss+refinementCss+actionCss+reframeCss;
  document.head.append(element);
}
function button(label:string) {
  const value=view!.host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(value).not.toBeNull();return value!;
}
function color(value:string) {
  if(value.startsWith("#"))return value.toLowerCase();
  return `#${(value.match(/\d+/g)??[]).slice(0,3).map(channel=>Number(channel).toString(16).padStart(2,"0")).join("")}`;
}
async function draft(input:HTMLInputElement,text:string) {
  await act(async()=>{input.focus();Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value")!.set!.call(input,text);input.dispatchEvent(new window.Event("input",{bubbles:true}));input.dispatchEvent(new window.Event("change",{bubbles:true}));});
}
async function pointerClick(target:HTMLButtonElement) {
  const down=new window.PointerEvent("pointerdown",{button:0,bubbles:true,cancelable:true});
  await act(async()=>{target.dispatchEvent(down);target.click();});
  return down;
}

it.each(["before","after"] as const)("mantém ativo branco/preto com CSS local %s da cascata global",async order=>{
  const settings={...defaultEditorSettings(),ratio:"16:9" as const,fit:"contain" as const};
  view=await reactHost(<><EditorInspector panel="reframe" settings={settings} onSettings={vi.fn()} onPanel={vi.fn()}/><EditorAction label="Ação fora da aba" icon={<span/>} pressed onClick={vi.fn()}/></>);
  styles(order);
  const active=window.getComputedStyle(button("Paisagem"));
  expect(color(active.backgroundColor)).toBe("#ffffff");expect(color(active.color)).toBe("#0a0a0a");
  const inactive=window.getComputedStyle(button("Vertical"));
  expect(color(inactive.backgroundColor)).toBe("#161616");expect(color(inactive.color)).toBe("#a0a0a0");
  expect(color(window.getComputedStyle(button("Ação fora da aba")).backgroundColor)).toBe("#303030");
});

it("usa o mesmo círculo e hexadecimal do campo de cor das legendas",async()=>{
  const settings={...defaultEditorSettings(),background:"#123456"};
  view=await reactHost(<EditorInspector panel="reframe" settings={settings} onSettings={vi.fn()} onPanel={vi.fn()}/>);
  styles();
  const input=view.host.querySelector<HTMLInputElement>('input[aria-label="Cor de fundo"]')!;
  expect(input.closest(".studio-color")?.querySelector(".studio-color__value")?.textContent).toBe("#123456");
  expect(window.getComputedStyle(input).width).toBe("26px");expect(window.getComputedStyle(input).borderRadius).toBe("50%");
  expect(view.host.querySelector(".reframe-panel__background")).toBeNull();
  await view.render(<EditorInspector panel="captions" settings={settings} onSettings={vi.fn()} onPanel={vi.fn()}/>);
  expect(view.host.querySelector('input[aria-label="Cor do texto da legenda"]')?.closest(".studio-color")).not.toBeNull();
});

it("clique usa zoom útil, setas preservam precisão e um draft mais clique emite somente uma alteração",async()=>{
  const change=vi.fn();
  function Controlled(){const[value,setValue]=useState(1.75);return <InspectorNumberField label="Zoom" caption="Zoom" value={value} min={1} max={3} step={.01} clickStep={.1} onChange={next=>{change(next);setValue(next);}}/>;}
  view=await reactHost(<Controlled/>);
  const input=view.host.querySelector("input")!;
  await pointerClick(button("Aumentar Zoom"));expect(change).toHaveBeenLastCalledWith(1.85);
  await act(async()=>{input.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,cancelable:true}));});
  expect(change).toHaveBeenLastCalledWith(1.84);
  await draft(input,"2.95");change.mockClear();
  const down=await pointerClick(button("Aumentar Zoom"));
  expect(down.defaultPrevented).toBe(true);expect(document.activeElement).toBe(input);
  expect(change).toHaveBeenCalledTimes(1);expect(change).toHaveBeenLastCalledWith(3);expect(input.value).toBe("3");
  expect(button("Aumentar Zoom").getAttribute("aria-disabled")).toBe("true");
  await pointerClick(button("Aumentar Zoom"));expect(change).toHaveBeenCalledTimes(1);
  expect(button("Diminuir Zoom").closest("label")).toBeNull();
});

it.each([false,true])("passos respeitam pai que recusa e bloqueio %s",async disabled=>{
  const change=vi.fn();
  view=await reactHost(<InspectorNumberField label="Zoom" caption="Zoom" value={1.75} min={1} max={3} step={.01} clickStep={.1} disabled={disabled} onChange={change}/>);
  await pointerClick(button("Aumentar Zoom"));
  if(disabled)expect(change).not.toHaveBeenCalled();else { expect(change).toHaveBeenCalledTimes(1);expect(change).toHaveBeenLastCalledWith(1.85); }
  expect(view.host.querySelector("input")!.value).toBe("1.75");
});

it("clique altera só o painel split escolhido ou a escala da camada e mantém bloqueio",async()=>{
  const change=vi.fn();
  const layout=defaultSplitScreen();
  view=await reactHost(<EditorInspector panel="reframe" settings={{...defaultEditorSettings(),ratio:"9:16",splitScreen:layout}} onSettings={change} onPanel={vi.fn()}/>);
  await pointerClick(button("Aumentar Zoom da pessoa de baixo"));
  expect(change).toHaveBeenCalledTimes(1);
  expect(change).toHaveBeenLastCalledWith({splitScreen:{...layout,bottom:{...layout.bottom,zoom:1.1}}});
  change.mockClear();
  const placement={x:20,y:40,scale:.4,opacity:.5};
  const render=(disabled:boolean)=><CompositionPlacementControls placement={placement} disabled={disabled} cropping={false} onChange={change}/>;
  await view.render(render(false));
  await pointerClick(button("Aumentar Escala da sobreposição"));
  expect(change).toHaveBeenCalledTimes(1);expect(change).toHaveBeenLastCalledWith({...placement,scale:.41});
  change.mockClear();await view.render(render(true));
  await pointerClick(button("Aumentar Escala da sobreposição"));expect(change).not.toHaveBeenCalled();
});
