/**
 * Manifesto de mídias do Hero Galaxy — Fase 03B.6 (20 MP4 oficiais da CDN).
 *
 * Cada entrada: vídeo servido pelo proxy `cnpmedia://` (mesmo app, ACAO *,
 * cache em disco no app-data — ver src-tauri/src/media_proxy.rs) + poster
 * LOCAL gerado dos próprios arquivos (frame não preto, ~480px). O aspect é
 * o da pasta (1:1, 9:16, 16:9); a proporção REAL do arquivo chega em
 * runtime via loadedmetadata (clipVA) e alimenta o cover-fit do shader.
 *
 * Substituir/adicionar/remover mídias = editar apenas este manifesto; os
 * shaders e a física do Hero Galaxy não mudam.
 */

export interface GalaxyClip {
  id: string;
  /** URL do vídeo pelo proxy de mídia (cache local + ACAO). */
  videoUrl: string;
  /** Poster local (bundle) — exibido até o vídeo ter frame (e offline). */
  poster: string;
  /** Proporção nominal (largura/altura) da família do arquivo. */
  aspect: number;
  mediaType: "video";
}

const CDN_PATH = "https://pub-d187d959393643849829e2af107e1fd4.r2.dev/cutNicePro";
// No Windows/WebView2 o scheme custom do Tauri é servido como
// http://<scheme>.localhost/ (comprovado: 206 + CORS no teste de diagnóstico).
const proxy = (rel: string) =>
  `http://cnpmedia.localhost/cutNicePro/${rel}`;

import p11_01 from "../../assets/posters/1-1-1-1_01.png";
import p11_02 from "../../assets/posters/1-1-1-1_02.png";
import p11_03 from "../../assets/posters/1-1-1-1_03.png";
import p11_04 from "../../assets/posters/1-1-1-1_04.png";
import p11_05 from "../../assets/posters/1-1-1-1_05.png";
import p11_06 from "../../assets/posters/1-1-1-1_06.png";
import p11_07 from "../../assets/posters/1-1-1-1_07.png";
import p916_01 from "../../assets/posters/9-16-9-16_01.png";
import p916_02 from "../../assets/posters/9-16-9-16_02.png";
import p916_03 from "../../assets/posters/9-16-9-16_03.png";
import p916_04 from "../../assets/posters/9-16-9-16_04.png";
import p916_05 from "../../assets/posters/9-16-9-16_05.png";
import p916_06 from "../../assets/posters/9-16-9-16_06.png";
import p916_07 from "../../assets/posters/9-16-9-16_07.png";
import p169_01 from "../../assets/posters/16-9-16-9_01.png";
import p169_02 from "../../assets/posters/16-9-16-9_02.png";
import p169_03 from "../../assets/posters/16-9-16-9_03.png";
import p169_05 from "../../assets/posters/16-9-16-9_05.png";
import p169_06 from "../../assets/posters/16-9-16-9_06.png";
import p169_07 from "../../assets/posters/16-9-16-9_07.png";

function entry(dir: string, n: string, aspect: number, poster: string): GalaxyClip {
  const rel = `${dir}/${dir}_${n}.mp4`;
  return {
    id: `${dir}_${n}`,
    videoUrl: proxy(rel),
    poster,
    aspect,
    mediaType: "video",
  };
}

const SQ = 1;
const VT = 9 / 16;
const WD = 16 / 9;

/** Os 20 arquivos oficiais (16-9_04 é ausência INTENCIONAL). */
export const GALAXY_MEDIA: GalaxyClip[] = [
  entry("1-1", "01", SQ, p11_01),
  entry("1-1", "02", SQ, p11_02),
  entry("1-1", "03", SQ, p11_03),
  entry("1-1", "04", SQ, p11_04),
  entry("1-1", "05", SQ, p11_05),
  entry("1-1", "06", SQ, p11_06),
  entry("1-1", "07", SQ, p11_07),
  entry("9-16", "01", VT, p916_01),
  entry("9-16", "02", VT, p916_02),
  entry("9-16", "03", VT, p916_03),
  entry("9-16", "04", VT, p916_04),
  entry("9-16", "05", VT, p916_05),
  entry("9-16", "06", VT, p916_06),
  entry("9-16", "07", VT, p916_07),
  entry("16-9", "01", WD, p169_01),
  entry("16-9", "02", WD, p169_02),
  entry("16-9", "03", WD, p169_03),
  entry("16-9", "05", WD, p169_05),
  entry("16-9", "06", WD, p169_06),
  entry("16-9", "07", WD, p169_07),
];

/** Fonte CDN crua (auditoria/relatório — o produto consome o proxy). */
export const CDN_BASE = CDN_PATH;
