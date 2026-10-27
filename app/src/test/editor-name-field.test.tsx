import {act,useState} from "react";
import {afterEach,expect,it} from "vitest";
import {EditorNameField} from "../components/editor/EditorNameField";
import {reactHost} from "./react-host";

let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;});
it("mostra o contador e limita colagem/digitação sem dividir caracteres Unicode",async()=>{
  function Harness(){const [value,setValue]=useState("");return <EditorNameField id="name" label="Nome" value={value} onChange={setValue}/>;}
  view=await reactHost(<Harness/>);
  const input=view.host.querySelector<HTMLInputElement>('input')!;
  expect(view.host.textContent).toContain("0/120 caracteres");
  await act(async()=>{input.value="𠮷".repeat(121);input.dispatchEvent(new window.Event("input",{bubbles:true}));});
  expect(input.value).toBe("𠮷".repeat(120));
  expect(view.host.textContent).toContain("120/120 caracteres");
  await act(async()=>{input.value="a";input.dispatchEvent(new window.Event("input",{bubbles:true}));});
  expect(view.host.textContent).toContain("1/120 caracteres");
  expect(input.hasAttribute("title")).toBe(false);
});
