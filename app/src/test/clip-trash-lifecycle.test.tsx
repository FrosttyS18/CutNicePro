import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { cleanupClipTrash, clipRestoreFailure, clipTrashExpiresAt, CLIP_TRASH_RETENTION_MS, purgeClip } from "../lib/clip-trash";
import { useClipTrashExpiry } from "../hooks/useClipTrashExpiry";
import type { LibraryClip } from "../lib/clip-library";
import { reactHost } from "./react-host";

vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
let view:Awaited<ReturnType<typeof reactHost>>|undefined;
afterEach(async()=>{await view?.close();view=undefined;vi.useRealTimers();vi.clearAllMocks();});
const entry:LibraryClip={project:{id:"p",name:"Projeto",created_at_ms:1,updated_at_ms:1,last_opened_at_ms:null},mediaId:"m",
  clip:{id:"a".repeat(64),title:"Trecho",start:0,end:5,score:80,reasons:[],review:"pending",deleted:true,deletedAtMs:1000}};

function Subject({reload,active=true,empty=false}:{reload:()=>void;active?:boolean;empty?:boolean}){useClipTrashExpiry(empty?[]:[entry],reload,active);return null;}

it("agenda limpeza no limite exato e libera timer/listener ao fechar a biblioteca",async()=>{
  vi.useFakeTimers();vi.setSystemTime(1000+CLIP_TRASH_RETENTION_MS-1000);
  const reload=vi.fn();view=await reactHost(<Subject reload={reload}/>);
  await act(async()=>vi.advanceTimersByTime(999));expect(reload).not.toHaveBeenCalled();
  await act(async()=>vi.advanceTimersByTime(1));expect(reload).toHaveBeenCalledOnce();
  const environment=window;
  await view.close();view=undefined;
  environment.dispatchEvent(new environment.Event("focus"));
  vi.advanceTimersByTime(60000);expect(reload).toHaveBeenCalledOnce();
});

it("não usa a criação para expirar exclusões antigas sem data",()=>{
  expect(clipTrashExpiresAt({...entry.clip,deletedAtMs:undefined,createdAtMs:1})).toBeNull();
  expect(clipTrashExpiresAt({...entry.clip,deleted:false})).toBeNull();
  expect(clipTrashExpiresAt(entry.clip)).toBe(1000+CLIP_TRASH_RETENTION_MS);
});

it("suspende durante edição/job e retoma limpeza ao voltar à biblioteca",async()=>{
  vi.useFakeTimers();vi.setSystemTime(1000+CLIP_TRASH_RETENTION_MS);
  const reload=vi.fn();view=await reactHost(<Subject reload={reload} active={false}/>);
  await act(async()=>{window.dispatchEvent(new window.Event("focus"));vi.advanceTimersByTime(120000);});
  expect(reload).not.toHaveBeenCalled();
  await view.render(<Subject reload={reload}/>);
  await act(async()=>vi.advanceTimersByTime(1));expect(reload).toHaveBeenCalledOnce();
});

it("repete limpeza falha no máximo a cada minuto sem criar vários timers de foco",async()=>{
  vi.useFakeTimers();vi.setSystemTime(1000+CLIP_TRASH_RETENTION_MS);
  const reload=vi.fn();view=await reactHost(<Subject reload={reload}/>);
  await act(async()=>vi.advanceTimersByTime(1));expect(reload).toHaveBeenCalledOnce();
  await act(async()=>{window.dispatchEvent(new window.Event("focus"));window.dispatchEvent(new window.Event("focus"));});
  expect(reload).toHaveBeenCalledOnce();
  await act(async()=>vi.advanceTimersByTime(60000));expect(reload).toHaveBeenCalledTimes(2);
});

it("não cria loop se reload esvazia a coleção e a falha devolve o mesmo excluído",async()=>{
  vi.useFakeTimers();vi.setSystemTime(1000+CLIP_TRASH_RETENTION_MS);
  const reload=vi.fn();view=await reactHost(<Subject reload={reload}/>);
  await act(async()=>vi.advanceTimersByTime(1));expect(reload).toHaveBeenCalledOnce();
  await view.render(<Subject reload={reload} empty/>);
  await view.render(<Subject reload={reload}/>);
  await act(async()=>vi.advanceTimersByTime(59999));expect(reload).toHaveBeenCalledOnce();
  await act(async()=>vi.advanceTimersByTime(1));expect(reload).toHaveBeenCalledTimes(2);
});

it("valida a confirmação nativa e encaminha purge somente para o ID solicitado",async()=>{
  vi.mocked(invoke).mockResolvedValueOnce(2);
  await expect(cleanupClipTrash("p")).resolves.toBe(2);
  expect(invoke).toHaveBeenLastCalledWith("cleanup_clip_trash",{projectId:"p"});
  vi.mocked(invoke).mockResolvedValueOnce(null);
  await expect(cleanupClipTrash("p")).rejects.toThrow("confirmar");
  vi.mocked(invoke).mockResolvedValueOnce(undefined);
  await purgeClip("p","m",entry.clip.id);
  expect(invoke).toHaveBeenLastCalledWith("purge_clip",{projectId:"p",mediaId:"m",clipId:entry.clip.id});
});

it("informa que restaurar um ID já purgado exige atualizar a biblioteca",()=>{
  expect(clipRestoreFailure("Este clipe foi excluído permanentemente. Atualize a biblioteca.")).toContain("já foi excluído permanentemente");
  expect(clipRestoreFailure("disk failure")).toBe("Não foi possível restaurar o clipe. Tente novamente.");
});
