import { requireComposition } from "./composition";
import { assertWritable, editId, linkedSelection } from "./composition-operations";
import type { Composition } from "./composition-types";

export function detachAudio(document: Composition, ids: string[]): Composition {
  const audio = linkedSelection(document, ids).filter(item => item.kind === "audio"
    && document.items.some(other => other.id !== item.id && other.groupId === item.groupId));
  if (!audio.length) return document;
  assertWritable(document, audio);
  const groups = new Map(audio.map(item => [item.id, editId()]));
  return requireComposition({ ...document, items: document.items.map(item => groups.has(item.id) ? { ...item, groupId: groups.get(item.id)! } : item) });
}

export function setItemFollowsMain(document: Composition, id: string, followsMain: boolean): Composition {
  const item=document.items.find(value=>value.id===id);
  if(!item)throw new Error("Item não encontrado");
  assertWritable(document,[item]);
  if(document.tracks.some(track=>track.id===item.trackId&&track.primary))throw new Error("A faixa principal acompanha a montagem");
  if(item.followsMain===followsMain)return document;
  return requireComposition({...document,items:document.items.map(value=>value.id===id?{...value,followsMain}:value)});
}
