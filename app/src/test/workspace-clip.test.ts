import { afterEach, expect, it, vi } from "vitest";
import { emptyWorkspace } from "../lib/workspace";
import { readWorkspace, saveWorkspace } from "../services/workspace-store";

afterEach(() => vi.unstubAllGlobals());
it("reabre o corte ativo sem perder seu vínculo nem o intervalo salvo", () => {
  const memory = new Map<string,string>();
  vi.stubGlobal("localStorage",{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value)});
  const workspace = emptyWorkspace();
  workspace.activeClipId = "a".repeat(64);
  workspace.settings.trimStart = 12; workspace.settings.trimEnd = 40;
  workspace.settings.focalPoint = {x:20,y:70};
  expect(saveWorkspace("p",workspace)).toBe(true);
  expect(readWorkspace("p")).toEqual(workspace);
  const legacy = {...workspace,activeClipId:undefined};
  expect(saveWorkspace("legacy",legacy)).toBe(true);
  expect(readWorkspace("legacy").activeClipId).toBeUndefined();
});
