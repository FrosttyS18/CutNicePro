export type ToolId = "editor" | "clips" | "captions" | "reframe";

export interface VideoTool {
  id: ToolId;
  title: string;
  description: string;
}

export const videoTools: VideoTool[] = [
  { id: "editor", title: "Editar vídeo", description: "Seu vídeo, do primeiro corte ao ajuste final." },
  { id: "clips", title: "Converter longo para curto", description: "Encontre destaques e transforme vídeos longos em cortes." },
  { id: "captions", title: "Legendas IA", description: "Adicione legendas estilosas ou traduza seu conteúdo com um clique." },
  { id: "reframe", title: "Reenquadrar IA", description: "Adapte o enquadramento do seu vídeo para cada plataforma." },
];

export const captionModels = ["Sem legenda", ...Array.from({ length: 9 }, (_, index) => `Modelo ${index + 1}`)];
export const aspectRatios = ["16:9", "9:16", "1:1", "4:5"] as const;
export type AspectRatio = typeof aspectRatios[number];
