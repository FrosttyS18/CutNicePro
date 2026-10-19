/**
 * Contrato de dados dos cartões de mídia da Home (consumido pelo
 * Hero Galaxy portado e pelas fontes de placeholders).
 *
 * Cada cartão tem dados independentes — o motor nunca depende do conteúdo
 * gráfico: a expansão funciona igual com placeholder, imagem real ou, no
 * futuro, prévia de vídeo (previewSrc). `ratio` é largura/altura:
 * 16:9 ≈ 1.778, 1:1 = 1, 4:5 = 0.8, 9:16 = 0.5625.
 *
 * Placeholders são ORIGINAIS e locais (sem URLs externas, sem material de
 * terceiros) e serão substituídos pelas mídias oficiais do mantenedor.
 */

export type OrbitMediaType = "image" | "video";

export interface OrbitCardData {
  id: string;
  mediaType: OrbitMediaType;
  /** Miniatura local (import bundlado; nunca URL remota). */
  thumbnail: string;
  /** Proporção largura/altura do cartão. */
  ratio: number;
  /** Texto alternativo (acessibilidade do cartão-botão). */
  alt: string;
  /** Fonte de prévia maior para o estado expandido (opcional/futuro). */
  previewSrc?: string;
}

export const CARD_RATIOS = {
  vertical: 9 / 16,
  portrait: 4 / 5,
  square: 1,
  wide: 16 / 9,
} as const;

import card45a from "../assets/placeholders/card-01.svg";
import card45b from "../assets/placeholders/card-02.svg";
import card45c from "../assets/placeholders/card-03.svg";
import card45d from "../assets/placeholders/card-04.svg";
import card916a from "../assets/placeholders/card-916-01.svg";
import card916b from "../assets/placeholders/card-916-02.svg";
import card916c from "../assets/placeholders/card-916-03.svg";
import card916d from "../assets/placeholders/card-916-04.svg";
import card169a from "../assets/placeholders/card-169-01.svg";
import card169b from "../assets/placeholders/card-169-02.svg";
import card169c from "../assets/placeholders/card-169-03.svg";
import card169d from "../assets/placeholders/card-169-04.svg";
import card11a from "../assets/placeholders/card-11-01.svg";
import card11b from "../assets/placeholders/card-11-02.svg";
import card11c from "../assets/placeholders/card-11-03.svg";
import card11d from "../assets/placeholders/card-11-04.svg";

/** Placeholders originais locais: 4 tratamentos × 4 proporções. */
export const contactSheetPlaceholders: OrbitCardData[] = [
  { id: "ph-wide-1", mediaType: "image", thumbnail: card169a, ratio: CARD_RATIOS.wide, alt: "Miniatura de vídeo panorâmica pendente 1" },
  { id: "ph-wide-2", mediaType: "image", thumbnail: card169b, ratio: CARD_RATIOS.wide, alt: "Miniatura de vídeo panorâmica pendente 2" },
  { id: "ph-wide-3", mediaType: "image", thumbnail: card169c, ratio: CARD_RATIOS.wide, alt: "Miniatura de vídeo panorâmica pendente 3" },
  { id: "ph-wide-4", mediaType: "image", thumbnail: card169d, ratio: CARD_RATIOS.wide, alt: "Miniatura de vídeo panorâmica pendente 4" },
  { id: "ph-vert-1", mediaType: "image", thumbnail: card916a, ratio: CARD_RATIOS.vertical, alt: "Miniatura de vídeo vertical pendente 1" },
  { id: "ph-vert-2", mediaType: "image", thumbnail: card916b, ratio: CARD_RATIOS.vertical, alt: "Miniatura de vídeo vertical pendente 2" },
  { id: "ph-vert-3", mediaType: "image", thumbnail: card916c, ratio: CARD_RATIOS.vertical, alt: "Miniatura de vídeo vertical pendente 3" },
  { id: "ph-vert-4", mediaType: "image", thumbnail: card916d, ratio: CARD_RATIOS.vertical, alt: "Miniatura de vídeo vertical pendente 4" },
  { id: "ph-sq-1", mediaType: "image", thumbnail: card11a, ratio: CARD_RATIOS.square, alt: "Miniatura de vídeo quadrada pendente 1" },
  { id: "ph-sq-2", mediaType: "image", thumbnail: card11b, ratio: CARD_RATIOS.square, alt: "Miniatura de vídeo quadrada pendente 2" },
  { id: "ph-sq-3", mediaType: "image", thumbnail: card11c, ratio: CARD_RATIOS.square, alt: "Miniatura de vídeo quadrada pendente 3" },
  { id: "ph-sq-4", mediaType: "image", thumbnail: card11d, ratio: CARD_RATIOS.square, alt: "Miniatura de vídeo quadrada pendente 4" },
  { id: "ph-45-1", mediaType: "image", thumbnail: card45a, ratio: CARD_RATIOS.portrait, alt: "Miniatura de vídeo pendente 1" },
  { id: "ph-45-2", mediaType: "image", thumbnail: card45b, ratio: CARD_RATIOS.portrait, alt: "Miniatura de vídeo pendente 2" },
  { id: "ph-45-3", mediaType: "image", thumbnail: card45c, ratio: CARD_RATIOS.portrait, alt: "Miniatura de vídeo pendente 3" },
  { id: "ph-45-4", mediaType: "image", thumbnail: card45d, ratio: CARD_RATIOS.portrait, alt: "Miniatura de vídeo pendente 4" },
];

/** Fontes externas são proibidas neste estágio (verificação de contrato). */
export function assertLocalSources(sources: OrbitCardData[]): boolean {
  return sources.every((s) => !/^https?:\/\//i.test(s.thumbnail));
}
