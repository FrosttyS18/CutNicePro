import { act, useRef, useState } from "react";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositionPanelResize } from "../components/editor/CompositionPanelResize";
import { reactHost } from "./react-host";

let mounted:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await mounted?.close();mounted=undefined;});
function Probe({onChange=vi.fn()}:{onChange?:(value:number)=>void}){
  const containerRef=useRef<HTMLDivElement>(null);const [value,setValue]=useState(220);
  return <div ref={containerRef} style={{height:800}}><CompositionPanelResize value={value} onChange={next=>{onChange(next);setValue(next);}} containerRef={containerRef}/><output>{value}</output></div>;
}
describe("altura do painel da timeline",()=>{
  it("expõe separador acessível e limites pelo contêiner com teclado",async()=>{
    mounted=await reactHost(<Probe/>,environment=>{Object.defineProperty(environment.HTMLElement.prototype,"getBoundingClientRect",{configurable:true,value:()=>({height:800})});});
    const separator=mounted.host.querySelector<HTMLElement>('[role="separator"]')!;
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal");expect(separator.getAttribute("tabindex")).toBe("0");
    const minimum=Number(separator.getAttribute("aria-valuemin"));const maximum=Number(separator.getAttribute("aria-valuemax"));
    expect(minimum).toBeGreaterThan(0);expect(maximum).toBeLessThan(800);
    await act(async()=>{separator.dispatchEvent(new window.KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true,cancelable:true}));});
    expect(separator.getAttribute("aria-valuenow")).toBe("230");
    await act(async()=>{separator.dispatchEvent(new window.KeyboardEvent("keydown",{key:"End",bubbles:true,cancelable:true}));});expect(Number(separator.getAttribute("aria-valuenow"))).toBe(maximum);
    await act(async()=>{separator.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Home",bubbles:true,cancelable:true}));});expect(Number(separator.getAttribute("aria-valuenow"))).toBe(minimum);
  });
  it("usa posição final do ponteiro e Escape restaura altura e remove listeners",async()=>{
    const change=vi.fn();mounted=await reactHost(<Probe onChange={change}/>);
    const separator=mounted.host.querySelector<HTMLElement>('[role="separator"]')!;
    await act(async()=>{separator.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientY:300,bubbles:true}));window.dispatchEvent(new window.MouseEvent("pointermove",{clientY:280}));window.dispatchEvent(new window.MouseEvent("pointerup",{clientY:250}));});
    expect(separator.getAttribute("aria-valuenow")).toBe("270");
    await act(async()=>{separator.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientY:300,bubbles:true}));window.dispatchEvent(new window.MouseEvent("pointermove",{clientY:200}));window.dispatchEvent(new window.KeyboardEvent("keydown",{key:"Escape",cancelable:true}));});
    expect(separator.getAttribute("aria-valuenow")).toBe("270");const count=change.mock.calls.length;
    await act(async()=>{window.dispatchEvent(new window.MouseEvent("pointerup",{clientY:100}));window.dispatchEvent(new window.MouseEvent("pointermove",{clientY:0}));});expect(change).toHaveBeenCalledTimes(count);
  });
  it("desmontagem cancela frame pendente sem publicar mudança tardia",async()=>{
    const pending=new Map<number,FrameRequestCallback>();let token=0;const change=vi.fn();
    mounted=await reactHost(<Probe onChange={change}/>,environment=>{
      Object.defineProperty(environment,"requestAnimationFrame",{configurable:true,value:(callback:FrameRequestCallback)=>{pending.set(++token,callback);return token;}});
      Object.defineProperty(environment,"cancelAnimationFrame",{configurable:true,value:(id:number)=>{pending.delete(id);}});
    });
    const separator=mounted.host.querySelector<HTMLElement>('[role="separator"]')!;
    await act(async()=>{separator.dispatchEvent(new window.MouseEvent("pointerdown",{button:0,clientY:300,bubbles:true}));window.dispatchEvent(new window.MouseEvent("pointermove",{clientY:200}));});
    await mounted.close();mounted=undefined;expect(pending.size).toBe(0);expect(change).not.toHaveBeenCalled();
  });
  it("mantém uma única divisão visual sem bordas duplicadas entre prévia e timeline",async()=>{
    function Layout(){const containerRef=useRef<HTMLDivElement>(null);return <div ref={containerRef}><div className="composition-editor__timeline"><CompositionPanelResize value={220} onChange={()=>{}} containerRef={containerRef}/><section className="composition-timeline"/></div></div>;}
    mounted=await reactHost(<Layout/>,environment=>{
      const style=environment.document.createElement("style");
      style.textContent=["composition-timeline.css","composition-panel-resize.css","composition-editor.css"].map(file=>readFileSync(new URL(`../components/editor/${file}`,import.meta.url),"utf8")).join("\n");
      environment.document.head.append(style);
    });
    expect(mounted.host.querySelectorAll('[role="separator"][aria-orientation="horizontal"]')).toHaveLength(1);
    const outer=window.getComputedStyle(mounted.host.querySelector(".composition-editor__timeline")!);
    const inner=window.getComputedStyle(mounted.host.querySelector(".composition-timeline")!);
    expect(parseFloat(outer.borderTopWidth)||0).toBe(0);expect(parseFloat(inner.borderTopWidth)||0).toBe(0);
    expect(parseFloat(outer.paddingTop)||0).toBe(0);
    const rules=Array.from(globalThis.document.styleSheets).flatMap(sheet=>Array.from(sheet.cssRules));
    const line=rules.find(rule=>"selectorText" in rule&&rule.selectorText===".composition-panel-resize::after") as CSSStyleRule;
    expect(line.style.height).toBe("1px");expect(line.style.width).toBe("100%");
  });
});
