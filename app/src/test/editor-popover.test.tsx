import { afterEach,expect,it } from "vitest";
import { EditorPopover } from "../components/editor/EditorPopover";
import { reactHost } from "./react-host";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});
it("mantém as ações dentro da tela pela altura real do popover",async()=>{
  view=await reactHost(<EditorPopover label="Editar marcador" x={1200} y={700} onClose={()=>undefined}><input aria-label="Nome"/><button>Concluir</button></EditorPopover>,environment=>{
    Object.defineProperty(environment,"innerWidth",{value:1280});
    Object.defineProperty(environment,"innerHeight",{value:768});
    environment.HTMLElement.prototype.getBoundingClientRect=()=>new environment.DOMRect(0,0,320,286);
  });
  const popup=document.querySelector<HTMLElement>('[role="dialog"]')!;
  expect(popup.style.top).toBe("474px");
  expect(popup.style.left).toBe("952px");
  expect(Number.parseFloat(popup.style.top)+286).toBeLessThanOrEqual(window.innerHeight-8);
});
