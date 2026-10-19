import io

src = io.open("C:/CutNicePro/design/handoff/03b5/original/hero-galaxy.tsx", encoding="utf-8").read()
n_fail = []

def rep(old, new, count=1):
    global src
    if old not in src:
        n_fail.append(old[:70])
        return
    src = src.replace(old, new, count)

# 1) "use client" fora (Vite)
rep('"use client";\n\n', '')

# 2) imports adaptados
rep('import { SEEDANCE_SHOWCASE } from "@/lib/landing-data";',
    'import { GALAXY_MEDIA } from "./galaxy-media";')
rep('import { webglAvailable } from "@/lib/webgl-support";',
    'import { webglAvailable } from "./webgl-support";')
rep('import { introClock, introTuner } from "@/lib/intro";',
    'import { introClock, introTuner } from "./intro";')
rep('import { watchThemeColors, type ThemeColors } from "@/lib/theme-colors";',
    'import { watchThemeColors, type ThemeColors } from "./theme-colors";')
rep('import { useTunerStore } from "@/lib/tuner";',
    'import { useTunerStore } from "./tuner";')

# 3) Constantes de decode budget: so a cadencia do dedup permanece
rep('''// Decode budget (see the frame loop): clips whose best card is past the
// look tuner's playFrac compete for MAX_PLAYING decoder slots; the rest
// pause after a short hold. Starting a decoder is the expensive moment, so
// only a few resume per tick. A scrolled-away hero parks everything after a
// grace period (the frame loop is stopped by then).
const CULL_TICK_S = 0.25;
const CULL_HOLD_S = 1.2;
const MAX_PLAYING = 8;
const RESUME_PER_TICK = 3;
const PARK_DELAY_MS = 2500;''',
'''// 03B.5 port: as midias do CutNicePro sao IMAGENS locais - o decode budget
// de <video> do original nao se aplica. A cadencia do cull tick permanece
// porque o dedup de proximidade roda nela.
const CULL_TICK_S = 0.25;''')

# 4) Bloco de <video>/VideoTexture/priming -> texturas estaticas locais
old_videos = '''  // One <video>, one shared texture, and one cover-fit window per clip.
  const videos = useMemo(
    () =>
      SEEDANCE_SHOWCASE.map((clip) => {
        const v = document.createElement("video");
        v.src = clip.src;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.crossOrigin = "anonymous";
        v.disableRemotePlayback = true;
        // Metadata only: the decode budget pulls clips down as their cards
        // earn playback; the priming seek below fetches one frozen frame
        // for the cards that stay inner and blurred.
        v.preload = "metadata";
        return v;
      }),
    [],
  );
  // Native aspect per clip — the per-frame cover-fit needs it because each
  // card's own panel aspect morphs over its journey (square at birth).
  const clipVA = useMemo(() => {
    const a = new Float32Array(SEEDANCE_SHOWCASE.length);
    a.fill(16 / 9);
    return a;
  }, []);
  const textures = useMemo(
    () =>
      videos.map((v, i) => {
        const t = new THREE.VideoTexture(v);
        const record = () => {
          clipVA[i] = v.videoWidth / v.videoHeight || 16 / 9;
        };
        if (v.readyState >= 1) record();
        else v.addEventListener("loadedmetadata", record, { once: true });
        return t;
      }),
    [videos, clipVA],
  );

  // Video lifecycle keyed to the pool alone. Re-arm sources on every run:
  // React strict mode (and any remount) runs the cleanup, which unloads the
  // shared <video> elements the memo still holds.
  useEffect(() => {
    videos.forEach((v, i) => {
      if (!v.getAttribute("src")) {
        v.src = SEEDANCE_SHOWCASE[i].src;
        v.load();
      }
    });
    // Prime a frozen frame per clip, staggered so page load never fights a
    // burst of range requests. The seek target is a per-clip offset spread
    // across each clip's duration, so playback phases — and therefore loop
    // resets — never line up across the wall (most clips share a length).
    const timers = videos.map((v, i) =>
      setTimeout(() => {
        const seek = () => {
          if (!v.paused || v.currentTime !== 0) return;
          const usable = Math.max(0.2, (v.duration || 8) - 0.5);
          v.currentTime = 0.1 + ((i * 2.618) % usable);
        };
        if (v.readyState >= 1) seek();
        else v.addEventListener("loadedmetadata", seek, { once: true });
      }, 400 + i * 250),
    );
    return () => {
      timers.forEach(clearTimeout);
      textures.forEach((t) => t.dispose());
      videos.forEach((v) => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      });
    };
  }, [videos, textures]);

  // Scrolled away or backgrounded: the frame loop is stopped, so nothing
  // would ever pause these. Park them all after a grace period; the budget
  // re-grants slots on the first frame after the hero comes back.
  useEffect(() => {
    if (onScreen) return;
    const timer = setTimeout(
      () => videos.forEach((v) => v.pause()),
      PARK_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [onScreen, videos]);
'''
new_videos = '''  // 03B.5 port: midias locais estaticas - uma textura por fonte, aspect
  // declarado no contrato e corrigido pelo tamanho real da imagem. A mesma
  // cover-fit window por clip do original continua no shader.
  const clipVA = useMemo(() => {
    const a = new Float32Array(GALAXY_MEDIA.length);
    GALAXY_MEDIA.forEach((clip, i) => {
      a[i] = clip.aspect || 16 / 9;
    });
    return a;
  }, []);
  const texReady = useMemo(() => new Uint8Array(GALAXY_MEDIA.length), []);
  const textures = useMemo(
    () =>
      GALAXY_MEDIA.map((clip, i) =>
        new THREE.TextureLoader().load(clip.src, (loaded) => {
          texReady[i] = 1;
          clipVA[i] =
            loaded.image.width / Math.max(1, loaded.image.height) ||
            clip.aspect ||
            16 / 9;
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clipVA, texReady],
  );
  useEffect(
    () => () => {
      textures.forEach((t) => t.dispose());
    },
    [textures],
  );
'''
rep(old_videos, new_videos)

# 5) Referencias de contagem -> GALAXY_MEDIA
rep('        clip: i % SEEDANCE_SHOWCASE.length,', '        clip: i % GALAXY_MEDIA.length,')
rep('''  const clipLastUsed = useMemo(() => {
    const a = new Float32Array(SEEDANCE_SHOWCASE.length);''',
'''  const clipLastUsed = useMemo(() => {
    const a = new Float32Array(GALAXY_MEDIA.length);''')
rep('  const clipOrder = useMemo(() => SEEDANCE_SHOWCASE.map((_, i) => i), []);\n', '')
rep('''  const videoAlpha = useMemo(() => new Float32Array(cards.length), [cards]);
  const clipBest = useMemo(
    () => new Float32Array(SEEDANCE_SHOWCASE.length),
    [],
  );
  const clipIdle = useMemo(
    () => new Float32Array(SEEDANCE_SHOWCASE.length),
    [],
  );''',
'''  const videoAlpha = useMemo(() => new Float32Array(cards.length), [cards]);''')

# 6) frame loop: sem decode budget
rep('    clipBest.fill(-1);\n\n', '')
rep('''      applyDecodeBudget(
        videos,
        clipBest,
        clipIdle,
        clipOrder,
        lk.playFrac,
        CULL_TICK_S,
      );

      // Proximity dedup''', '''      // Proximity dedup''')
rep('''      // A targeted card's clip outranks everything in the decode budget so
      // it plays immediately, wherever it is on the journey.
      const pri = tk > 0.05 ? 2 : c;
      if ((u.uAlpha.value > 0.04 || tk > 0.05) && pri > clipBest[card.clip]) {
        clipBest[card.clip] = pri;
      }
''', '')
rep('''      const ready = videos[card.clip].readyState >= 2 ? 1 : 0;
      videoAlpha[i] += (ready - videoAlpha[i]) * (1 - Math.exp(-3 * dt));''',
'''      // 03B.5 port: "ready" e a textura local carregada (sem decoders).
      const ready = texReady[card.clip];
      videoAlpha[i] += (ready - videoAlpha[i]) * (1 - Math.exp(-3 * dt));''')

# 7) applyDecodeBudget fora
old_fn = '''// Hand the scarce decoders to the clips whose best card is furthest along
// (the sharp outer ones), and only past the play threshold — inner blurred
// cards keep their primed frozen frame. `elapsed` is the time since the
// previous call: this runs on the cull tick, not every frame.
function applyDecodeBudget(
  videos: HTMLVideoElement[],
  clipBest: Float32Array,
  clipIdle: Float32Array,
  clipOrder: number[],
  playFrac: number,
  elapsed: number,
) {
  clipOrder.sort((a, b) => clipBest[b] - clipBest[a]);
  let started = 0;
  for (let rank = 0; rank < clipOrder.length; rank++) {
    const clip = clipOrder[rank];
    const v = videos[clip];
    if (rank < MAX_PLAYING && clipBest[clip] >= playFrac) {
      clipIdle[clip] = 0;
      if (v.paused && started < RESUME_PER_TICK) {
        started++;
        v.play().catch(() => {});
      }
      continue;
    }
    clipIdle[clip] += elapsed;
    if (clipIdle[clip] >= CULL_HOLD_S && !v.paused) v.pause();
  }
}

'''
rep(old_fn, '')

# 8) Aspecto final POR CARTAO (fase 2 da missao)
rep('''      // Newborns are rounded squares that morph into 16:9 as they grow.
      // The neighbor separation above assumes the full 16:9 width, so the
      // narrower young cards are strictly safer.
      const aspect = 1 + (16 / 9 - 1) * smoothstep(0, lk.aspectEnd, c);''',
'''      // Newborns are rounded squares that morph into their clip's final
      // aspect as they grow (03B.5: 16:9, 1:1 or 9:16 por midia). The
      // neighbor separation above still assumes the full 16:9 width, so
      // every narrower card (1:1, 9:16) remains strictly collision-safe.
      const aspect =
        1 + (clipAspectTarget(card.clip) - 1) * smoothstep(0, lk.aspectEnd, c);''')

rep('''        const Hc = cardH[cur];
        inCore = dxa <= (Hc * 8) / 9 + margin && dya <= Hc / 2 + margin;
        const Hb = Hc * (cur === st.boostCard ? boostF : 1);
        inBoost = dxa <= (Hb * 8) / 9 + margin && dya <= Hb / 2 + margin;''',
'''        const Hc = cardH[cur];
        const halfWc = (Hc * clipAspectTarget(cards[cur].clip)) / 2;
        inCore = dxa <= halfWc + margin && dya <= Hc / 2 + margin;
        const Hb = Hc * (cur === st.boostCard ? boostF : 1);
        inBoost =
          dxa <= halfWc * (cur === st.boostCard ? boostF : 1) + margin &&
          dya <= Hb / 2 + margin;''')
rep('''          if (
            Math.abs(ptr.x - wxp) <= (H * 8) / 9 &&
            Math.abs(ptr.y - wyp) <= H / 2
          ) {''',
'''          if (
            Math.abs(ptr.x - wxp) <=
              (H * clipAspectTarget(cards[i].clip)) / 2 &&
            Math.abs(ptr.y - wyp) <= H / 2
          ) {''')
rep('''        const tAspect =
          1 + (16 / 9 - 1) * smoothstep(0, lk.aspectEnd, cardCyc[ti]);''',
'''        const tAspect =
          1 +
          (clipAspectTarget(cards[ti].clip) - 1) *
            smoothstep(0, lk.aspectEnd, cardCyc[ti]);''')

# 9) helper do aspecto alvo por clip (antes de "export default")
rep('export default function HeroGalaxy() {',
'''/** Aspecto final (w/h) do cartao pela midia: 16:9, 1:1 ou 9:16.
 *  Nunca acima de 16:9 - a fisica de sizing assume esse maximo. */
function clipAspectTarget(clip: number): number {
  const a = GALAXY_MEDIA[clip]?.aspect || 16 / 9;
  return Math.min(16 / 9, Math.max(9 / 16, a));
}

export default function HeroGalaxy() {''')

io.open("C:/CutNicePro/app/src/components/galaxy/hero-galaxy.tsx", "w", encoding="utf-8").write(src)
if n_fail:
    print("FALHARAM:", len(n_fail))
    for f in n_fail:
        print(" -", f)
else:
    print("port aplicado: todos os patches casaram")
