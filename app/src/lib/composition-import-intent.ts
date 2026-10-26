import type { CompositionDropTarget } from "./composition-asset-drop";
import type { MediaKind } from "./composition-types";
import { MEDIA_FILE_EXTENSIONS } from "./media-file-types";
import { mediaFileName } from "./media-name";

export type CompositionImportIntent={kind:"library"}|{kind:"drop";target:CompositionDropTarget};

export function compositionMediaKind(path:string):MediaKind|null{
  const extension=mediaFileName(path).split(".").pop()?.toLowerCase();
  if(!extension)return null;
  return (Object.keys(MEDIA_FILE_EXTENSIONS) as MediaKind[]).find(kind=>MEDIA_FILE_EXTENSIONS[kind].includes(extension))??null;
}
