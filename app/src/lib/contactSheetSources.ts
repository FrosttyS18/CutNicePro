/**
 * Contrato de dados dos cartões de mídia da Home (OrbitingMediaHero).
 *
 * Cada cartão recebe seu asset e sua proporção POR PROPRIEDADE — a troca
 * futura pelas thumbnails oficiais não exige alteração no motor da animação.
 * `ratio` é largura/altura: 9:16 = 0.5625, 4:5 = 0.8, 1:1 = 1, 16:9 ≈ 1.778.
 *
 * Placeholders são ORIGINAIS e locais (sem URLs externas, sem material de
 * terceiros). Fontes externas são proibidas neste estágio.
 */

export interface ContactCardSource {
  /** Caminho local do asset (import bundlado; nunca URL remota). */
  src: string;
  /** Texto alternativo do cartão. */
  alt: string;
  /** Proporção largura/altura do cartão. */
  ratio: number;
}

export const CARD_RATIOS = {
  vertical: 9 / 16,
  portrait: 4 / 5,
  square: 1,
  wide: 16 / 9,
} as const;

/** Configuração padrão do OrbitingMediaHero (calibrada pela inspeção 03B.2
 *  e recomposição 03B.3 — qualidade visual sobre quantidade). */
export const ORBIT_DEFAULTS = {
  cardCount: 16,
} as const;

import card45a from "../assets/placeholders/card-01.svg";
import card45b from "../assets/placeholders/card-02.svg";
import card45c from "../assets/placeholders/card-03.svg";
import card45d from "../assets/placeholders/card-04.svg";
import card45e from "../assets/placeholders/card-05.svg";
import card45f from "../assets/placeholders/card-06.svg";
import card916a from "../assets/placeholders/card-916-01.svg";
import card916b from "../assets/placeholders/card-916-02.svg";
import card169a from "../assets/placeholders/card-169-01.svg";
import card169b from "../assets/placeholders/card-169-02.svg";
import card11a from "../assets/placeholders/card-11-01.svg";
import card11b from "../assets/placeholders/card-11-02.svg";

/** Placeholders originais locais nas quatro proporções suportadas. */
export const contactSheetPlaceholders: ContactCardSource[] = [
  { src: card45a, alt: "Miniatura pendente 1", ratio: CARD_RATIOS.portrait },
  { src: card45b, alt: "Miniatura pendente 2", ratio: CARD_RATIOS.portrait },
  { src: card45c, alt: "Miniatura pendente 3", ratio: CARD_RATIOS.portrait },
  { src: card45d, alt: "Miniatura pendente 4", ratio: CARD_RATIOS.portrait },
  { src: card45e, alt: "Miniatura pendente 5", ratio: CARD_RATIOS.portrait },
  { src: card45f, alt: "Miniatura pendente 6", ratio: CARD_RATIOS.portrait },
  { src: card916a, alt: "Miniatura pendente vertical 1", ratio: CARD_RATIOS.vertical },
  { src: card916b, alt: "Miniatura pendente vertical 2", ratio: CARD_RATIOS.vertical },
  { src: card169a, alt: "Miniatura pendente larga 1", ratio: CARD_RATIOS.wide },
  { src: card169b, alt: "Miniatura pendente larga 2", ratio: CARD_RATIOS.wide },
  { src: card11a, alt: "Miniatura pendente quadrada 1", ratio: CARD_RATIOS.square },
  { src: card11b, alt: "Miniatura pendente quadrada 2", ratio: CARD_RATIOS.square },
];

/** Fontes externas são proibidas neste estágio (verificação de contrato). */
export function assertLocalSources(sources: ContactCardSource[]): boolean {
  return sources.every((s) => !/^https?:\/\//i.test(s.src));
}
