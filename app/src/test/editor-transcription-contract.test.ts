import { afterEach, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getEditorTranscriptionJob, isEditorTranscriptionJob, readEditorTranscript, transcribeEditorMedia } from "../lib/editor-transcription";

vi.mock("@tauri-apps/api/core",()=>({invoke:vi.fn()}));
afterEach(()=>vi.clearAllMocks());
const job={jobId:"job",projectId:"p",mediaId:"a",state:"running",stage:"extracting",progress:0,error:null};
const record={version:1,mediaId:"a",language:"pt",model:"turbo",segments:[]};

it("job do editor exige identidade de mídia e os mesmos estados/progresso do contrato",()=>{
  expect(isEditorTranscriptionJob(job)).toBe(true);
  expect(isEditorTranscriptionJob({...job,mediaId:undefined})).toBe(false);
  expect(isEditorTranscriptionJob({...job,progress:120})).toBe(false);
  expect(isEditorTranscriptionJob({...job,mediaId:""})).toBe(false);
});
it("inicia somente o comando do editor com a mídia e opções explícitas",async()=>{
  vi.mocked(invoke).mockResolvedValue(job);
  expect(await transcribeEditorMedia("p","a","turbo","cpu")).toEqual(job);
  expect(invoke).toHaveBeenCalledWith("transcribe_editor_media",{projectId:"p",mediaId:"a",profile:"turbo",executionMode:"cpu"});
});
it("leitura vazia é válida e resposta de outra mídia nunca atravessa a fronteira",async()=>{
  vi.mocked(invoke).mockResolvedValue(record);
  expect(await readEditorTranscript("p","a")).toEqual(record);
  await expect(readEditorTranscript("p","b")).rejects.toThrow(/mídia/);
});
it("recupera job do projeto mesmo sem seleção e recusa projeto ou mídia divergente",async()=>{
  vi.mocked(invoke).mockResolvedValue(job);
  expect(await getEditorTranscriptionJob("p")).toEqual(job);
  expect(invoke).toHaveBeenCalledWith("get_editor_media_transcription_job",{projectId:"p"});
  await expect(getEditorTranscriptionJob("other")).rejects.toThrow(/transcrição/);
  await expect(getEditorTranscriptionJob("p","b")).rejects.toThrow(/transcrição/);
});
