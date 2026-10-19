import { act,type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Window } from "happy-dom";
import { vi } from "vitest";

export async function reactHost(node: ReactNode) {
  const environment=new Window({url:"http://localhost"});
  for(const [name,value] of Object.entries({window:environment,document:environment.document,navigator:environment.navigator,
    HTMLElement:environment.HTMLElement,HTMLVideoElement:environment.HTMLVideoElement,localStorage:environment.localStorage,
    IS_REACT_ACT_ENVIRONMENT:true})) vi.stubGlobal(name,value);
  Object.defineProperty(environment.HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(environment.HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
  const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
  await act(async()=>{root.render(node);});
  return {host,async click(text:string){
    const button=Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(item=>item.textContent?.trim()===text);
    if(!button) throw new Error(`Button not found: ${text}`);
    await act(async()=>{button.click();});
  },async close(){await act(async()=>root.unmount());host.remove();await environment.happyDOM.cancelAsync();vi.unstubAllGlobals();}};
}
