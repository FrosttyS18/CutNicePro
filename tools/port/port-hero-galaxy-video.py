import io

src = io.open("C:/CutNicePro/app/src/components/galaxy/hero-galaxy.tsx", encoding="utf-8").read()
fails = []

def rep(old, new, count=1):
    global src
    if old not in src:
        fails.append(old[:60])
        return
    src = src.replace(old, new, count)

# 1) constantes de decode budget (restauradas do original; MAX_PLAYING=8
#    inicial, sujeito aos testes de desempenho no WebView2)
rep('''// 03B.5 port: as midias do CutNicePro sao IMAGENS locais - o decode budget
// de <video> do original nao se aplica. A cadencia do cull tick permanece
// porque o dedup de proximidade roda nela.
const CULL_TICK_S = 0.25;''',
'''// Decode budget (restaurado do original na 03B.6): os cartões nítidos
// competem por MAX_PLAYING decoders; o resto pausa. A cadência também
// serve ao dedup de proximidade.
const CULL_TICK_S = 0.25;
const CULL_HOLD_S = 1.2;
const MAX_PLAYING = 8;
const RESUME_PER_TICK = 3;
const PARK_DELAY_MS = 2500;''')

# 2) texturas estáticas -> posters + <video> + VideoTexture + budget
rep('''  // 03B.5 port: midias locais estaticas - uma textura por fonte, aspect
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
  );''',
'''  // 03B.6: posters locais (bundle) + vídeos do manifesto via proxy
  // cnpmedia:// (crossOrigin anonymous; o proxy responde ACAO *). O aspect
  // nominal vem do manifesto; o REAL chega em loadedmetadata (clipVA).
  const clipVA = useMemo(() => {
    const a = new Float32Array(GALAXY_MEDIA.length);
    GALAXY_MEDIA.forEach((clip, i) => {
      a[i] = clip.aspect || 16 / 9;
    });
    return a;
  }, []);
  const posterReady = useMemo(() => new Uint8Array(GALAXY_MEDIA.length), []);
  const posterTextures = useMemo(
    () =>
      GALAXY_MEDIA.map((clip, i) => {
        const t = new THREE.TextureLoader().load(clip.poster, () => {
          posterReady[i] = 1;
        });
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [posterReady],
  );
  // Um <video> por mídia (pool único por URL), criado uma única vez; o
  // decode budget abaixo decide quem toca.
  const videos = useMemo(
    () =>
      GALAXY_MEDIA.map((clip) => {
        const v = document.createElement("video");
        v.src = clip.videoUrl;
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.crossOrigin = "anonymous";
        v.disableRemotePlayback = true;
        v.preload = "metadata";
        return v;
      }),
    [],
  );
  const videoTextures = useMemo(
    () =>
      videos.map((v, i) => {
        const t = new THREE.VideoTexture(v);
        const record = () => {
          clipVA[i] = v.videoWidth / Math.max(1, v.videoHeight) || GALAXY_MEDIA[i].aspect;
        };
        if (v.readyState >= 1) record();
        else v.addEventListener("loadedmetadata", record, { once: true });
        return t;
      }),
    [videos, clipVA],
  );
  // Falha de rede/CDN: re-armar o src com backoff (3 tentativas); o poster
  // permanece enquanto o vídeo não tem frame.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    videos.forEach((v, i) => {
      let tries = 0;
      const retry = () => {
        if (tries >= 3 || v.readyState >= 2) return;
        tries++;
        timers.push(setTimeout(() => {
          v.load();
          v.addEventListener("error", retry, { once: true });
        }, 15000 * tries));
      };
      v.addEventListener("error", retry, { once: true });
    });
    return () => timers.forEach(clearTimeout);
  }, [videos]);
  // Ciclo de vida do pool (re-armar src a cada montagem — strict mode pode
  // ter desmontado) + priming escalonado, como no original.
  useEffect(() => {
    videos.forEach((v, i) => {
      if (!v.getAttribute("src")) {
        v.src = GALAXY_MEDIA[i].videoUrl;
        v.load();
      }
    });
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
      posterTextures.forEach((t) => t.dispose());
      videoTextures.forEach((t) => t.dispose());
      videos.forEach((v) => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      });
    };
  }, [videos, posterTextures, videoTextures]);
  // Hero fora da tela: o frame loop para; estaciona os decoders.
  const parkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    if (onScreen) {
      clearTimeout(parkTimer.current);
      return;
    }
    parkTimer.current = setTimeout(() => videos.forEach((v) => v.pause()), PARK_DELAY_MS);
    return () => clearTimeout(parkTimer.current);
  }, [onScreen, videos]);''')

# 3) GalaxyScene precisa de onScreen de volta (park) — prop restaurada
rep('''            <GalaxyScene
              colors={colors}
              pointer={pointerRef}
              ripples={ripplesRef}
            />''', '''            <GalaxyScene
              colors={colors}
              onScreen={onScreen}
              pointer={pointerRef}
              ripples={ripplesRef}
            />''')
rep('''function GalaxyScene({
  colors,
  pointer,
  ripples,
}: {
  colors: ThemeColors;
  pointer: React.RefObject<GalaxyPointer>;
  ripples: React.RefObject<GalaxyRipple[]>;
}) {''', '''function GalaxyScene({
  colors,
  onScreen,
  pointer,
  ripples,
}: {
  colors: ThemeColors;
  onScreen: boolean;
  pointer: React.RefObject<GalaxyPointer>;
  ripples: React.RefObject<GalaxyRipple[]>;
}) {''')

# 4) materiais: uMap parte do POSTER (fallback imediato, offline incluso)
rep('''            uniforms: {
              uMap: { value: textures[c.clip] },''', '''            uniforms: {
              uMap: { value: posterTextures[c.clip] },''')
rep('''    [cards, textures],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);''',
'''    [cards, posterTextures],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);''')

# 5) troca uMap poster→video quando o vídeo ganha frame (mesmo conteúdo =
#    corte imperceptível; uTexA/videoAlpha continuam no unblur de nascimento)
rep('''      // 03B.5 port: "ready" e a textura local carregada (sem decoders).
      const ready = texReady[card.clip];
      videoAlpha[i] += (ready - videoAlpha[i]) * (1 - Math.exp(-3 * dt));''',
'''      const ready = videos[card.clip].readyState >= 2 ? 1 : 0;
      videoAlpha[i] += (ready - videoAlpha[i]) * (1 - Math.exp(-3 * dt));
      // Poster enquanto o vídeo não tem frame; troca direta quando ganha
      // (mesma cena → sem flash). Rebirth volta ao poster do novo clip.
      const wantVideo = videoAlpha[i] > 0.5 && ready === 1;
      const wantMap = wantVideo ? videoTextures[card.clip] : posterTextures[card.clip];
      if (u.uMap.value !== wantMap) u.uMap.value = wantMap;''')

# 6) decode budget de volta: clipBest/clipIdle/clipOrder + prioridade alvo
rep('''  const videoAlpha = useMemo(() => new Float32Array(cards.length), [cards]);''',
'''  const videoAlpha = useMemo(() => new Float32Array(cards.length), [cards]);
  const clipBest = useMemo(() => new Float32Array(GALAXY_MEDIA.length), []);
  const clipIdle = useMemo(() => new Float32Array(GALAXY_MEDIA.length), []);
  const clipOrder = useMemo(() => GALAXY_MEDIA.map((_, i) => i), []);''')
rep('''    st.lastP = P;
    const targeting = st.targetI >= 0;''', '''    st.lastP = P;
    clipBest.fill(-1);
    const targeting = st.targetI >= 0;''')
rep('''      // Proximity dedup''', '''      applyDecodeBudget(
        videos,
        clipBest,
        clipIdle,
        clipOrder,
        lk.playFrac,
        CULL_TICK_S,
      );

      // Proximity dedup''')
rep('''      const u = materials[i].uniforms;''',
'''      // Cartão em foco tem prioridade máxima de decodificação (original).
      const pri = tk > 0.05 ? 2 : c;
      if ((u0.uAlpha.value > 0.04 || tk > 0.05) && pri > clipBest[card.clip]) {
        clipBest[card.clip] = pri;
      }
      const u = materials[i].uniforms;''')
# u0 não existe — prioridade precisa ser APÓS o cálculo de uAlpha (fim do
# loop do cartão); removo este insert e faço no lugar certo.
# (o replace abaixo neutraliza)
rep('''      // Cartão em foco tem prioridade máxima de decodificação (original).
      const pri = tk > 0.05 ? 2 : c;
      if ((u0.uAlpha.value > 0.04 || tk > 0.05) && pri > clipBest[card.clip]) {
        clipBest[card.clip] = pri;
      }
      const u = materials[i].uniforms;''', '''      const u = materials[i].uniforms;''')
rep('''      u.uRadius.value = Math.min(lk.cornerPx, H * 0.49);
      u.uFrameA.value = lk.frameAlpha;
      u.uAlpha.value = lifecycle * waveK;''',
'''      u.uRadius.value = Math.min(lk.cornerPx, H * 0.49);
      u.uFrameA.value = lk.frameAlpha;
      u.uAlpha.value = lifecycle * waveK;

      // Prioridade de decodificação (original): o alvo ganha slot imediato.
      const pri = tk > 0.05 ? 2 : c;
      if ((u.uAlpha.value > 0.04 || tk > 0.05) && pri > clipBest[card.clip]) {
        clipBest[card.clip] = pri;
      }''')

# 7) applyDecodeBudget (função do original, adaptada ao pool por mídia)
rep('''// Hand the scarce decoders''', '''// Hand the scarce decoders''')
src_tail = '''
// Decode budget do original (03B.6): concede os MAX_PLAYING decoders às
// mídias cujo melhor cartão está mais avançado (e só past playFrac); o
// resto pausa após o hold. Roda no cull tick, não a cada frame.
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
if 'function applyDecodeBudget' not in src:
    src = src.rstrip() + '\n' + src_tail

io.open("C:/CutNicePro/app/src/components/galaxy/hero-galaxy.tsx", "w", encoding="utf-8").write(src)
if fails:
    print("FALHARAM:", len(fails))
    for f in fails:
        print(" -", f)
else:
    print("pipeline de vídeo restaurado")
