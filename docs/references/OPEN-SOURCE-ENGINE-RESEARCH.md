# Referências open source para o motor do CutNicePro

Pesquisa em 2026-10-19 para continuidade com ZCode. Recomendação: manter React/Tauri/Rust e integrar capacidades pequenas por adaptadores. Preservar a UI do CutNicePro. Esta pesquisa não instala motores nem aprova incorporar código de terceiros.

## Preparação de estudo AutoClip — 2026-10-23

O mantenedor solicitou estudo completo do código e comparação local, após rejeitar a edição demonstrativa e relatar regressões. Esta entrada registra a preparação do objetivo, não a execução do estudo.

- Principal: [zhouxiaoka/autoclip](https://github.com/zhouxiaoka/autoclip), página e árvore backend consultadas. Complementar: [artbyjazi/autoclip](https://github.com/artbyjazi/autoclip). São projetos diferentes; não misturar implementações.
- Nenhum commit externo fixado nesta preparação; o endpoint de commits via navegador não ficou acessível. O ZCode deverá registrar SHA completo e separar release/main antes de ler/adaptar código.
- O resumo enviado por outro ChatGPT é um conjunto de hipóteses a verificar (inclusive caminhos, modelos, tracking e limites), não prova de leitura de fonte, funcionamento ou qualidade. Nenhum AutoClip foi instalado/executado aqui.
- Estudo futuro: leitura integral de código autoral e testes/prompts/scripts, cobertura por arquivo, call graph e contratos; licença de código/modelos/dependências; execução local isolada e comparação de pipeline/modelos sob condições equivalentes. Não transpor benchmarks de API em nuvem para 4B/12B locais.
- Goal canônico preparado: `docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23/prompt-goal-zcode.txt`. O arquivo e a mensagem devem ter conteúdo idêntico. Resultados de pesquisa/decisões posteriores atualizam este documento incrementalmente.

## Situação atual e limite deste estudo — revisão 03N

A comparação original abaixo é pesquisa documental datada, não prova de que os fluxos dos aplicativos foram estudados de ponta a ponta ou adaptados. Houve leituras parciais e falhas de consulta já descritas em Fontes e limites. Não existe neste registro um mapeamento completo por revisão/arquivo/função que demonstre adoção de SupoClip, ViralMint, OpenClipper ou OpenCut. Não declarar essa adoção nem deduzir funcionamento apenas de README/estrelas.

Estado do nosso código após 03M: FFmpeg/ffprobe, whisper.cpp e Qwen3-4B textual já estão integrados por subprocessos; importação é persistente e render real existe. faster-whisper/Qwen3-ASR/Parakeet tiveram avaliações registradas, sem serem opções completas do pipeline do produto. As recomendações de “primeiro implementar transcrição/exportação” abaixo são históricas. A preferência atual por Turbo e retirada de Large completo consta na DEC-014; qualidade editorial e preenchimento 9:16 seguem defeitos abertos.

### Estudo obrigatório antes da próxima implementação

Usar os repositórios já listados, sem substituir a stack do CutNicePro. Para cada capacidade, registrar neste documento existente: URL e revisão efetivamente lida, caminhos/funções, contrato de entrada/saída, etapas/modelos, estados de erro/cancelamento/retomada, dependências/licenças, testes observados e adaptação escolhida. Explicar diferenças relevantes; não transpor uma infraestrutura de servidor/Docker para desktop por semelhança de tela. Falha de acesso é PENDING/BLOCKED, não evidência de comportamento. Esta tarefa documental não executa nem simula esse estudo técnico.

| Referência já indicada | Fluxos a estudar no código | Evidência de adaptação completa hoje |
|---|---|---|
| SupoClip | Seleção/contexto dos trechos, composição vertical e legendas | Não documentada; pendente |
| ViralMint | Encadeamento de etapas, jobs/falhas, timeline e render | Não documentada; pendente |
| OpenClipper | Contratos Tauri/Rust/React, ASR, enquadramento e exportação | Leitura anterior de Cargo.toml não comprova estudo desses fluxos |
| OpenCut / opencut-classic | Organização do editor, mídia e histórico | Não documentada; verificar a revisão adequada antes de adotar |

Esses focos são tarefas de investigação, não funcionalidades confirmadas por novo teste desses projetos. Manter as ressalvas de licença e as fontes históricas abaixo. Não atualizar estrelas/versões sem nova consulta, nem remover referências porque não foram usadas.

## Decisão proposta na pesquisa original — histórico

FFmpeg continua responsável por análise/transformação/render. Avaliar whisper.cpp como primeiro transcritor local e faster-whisper como alternativa medida, sem instalar ambos de início. Quando autorizada a importação real de links, integrar yt-dlp como etapa anterior ao mesmo armazenamento de mídia local. Aplicações completas servem para estudar contratos, jobs e experiência; não substituem automaticamente o projeto existente.

As estrelas abaixo são valores arredondados exibidos nas páginas consultadas, não medição de crescimento nem certificação de qualidade. Funcionalidades descritas são do código/documentação pública consultados; nenhum desses aplicativos foi instalado ou validado nesta pesquisa. Resultados de benchmarks dos autores não equivalem a desempenho na máquina do mantenedor.

## Aplicações completas para referência

| Repositório | Adoção observada / licença declarada | Contribuição para nosso projeto | Limite para adoção |
| --- | --- | --- | --- |
| [SupoClip](https://github.com/FujiwaraChoki/supoclip) | ~1,5 mil estrelas; AGPL-3.0 | Referência de seleção de momentos, enquadramento e legendas. | Setup rápido usa Docker e AssemblyAI; há documentação de modo local. Não adotar como motor local pronto sem avaliar esse caminho. |
| [ViralMint](https://github.com/openclaw-easy/ViralMint) | 167 estrelas; AGPL-3.0 | Referência de integração download → transcrição → timeline → export, incluindo FFmpeg/ASS e BYOK. | Plataforma ampla com FastAPI/React e vários serviços; reproduzir tudo ampliaria o escopo. Alegações de testes do README não foram executadas aqui. |
| [OpenClipper](https://github.com/GrepCut/OpenClipper) | 10 estrelas; MIT | Candidato mais próximo da stack: Tauri, React e Rust; documentação de ASR, enquadramento e export em Windows. Cargo.toml também consultado. | Pouca adoção pública. Proximidade técnica não comprova maturidade; estudar módulos e testes antes de reutilizar. |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | ~95,3 mil estrelas; MIT | Referência para editor, timeline e organização de mídia. | Main está em reescrita; o próprio projeto direciona o uso atual para [opencut-classic](https://github.com/OpenCut-app/opencut-classic). Não basear nosso motor num core em reconstrução. |

Minha avaliação: OpenClipper é o mais parecido com a arquitetura atual, enquanto SupoClip tem mais adoção que ele. Nenhum dos dois é automaticamente a melhor dependência para o MVP. Adoção de editor completo exigiria mudanças muito maiores que plugar transcrição e render.

## Motores e ferramentas especializados

| Repositório | Adoção observada / licença do repositório | Uso possível | Prioridade proposta |
| --- | --- | --- | --- |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | ~54,5 mil; MIT | Transcrição local em C/C++, executável separado e suporte a processamento CPU. | Primeira avaliação para M3; medir fala pt-BR e memória antes de fixar modelo. |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | ~26 mil; MIT | Transcrição com CTranslate2, CPU int8/GPU e timestamps. | Alternativa ao primeiro candidato; exige considerar distribuição do runtime Python e dependências. Não presumir vencedor por benchmarks diferentes. |
| [WhisperX](https://github.com/m-bain/whisperX) | ~24,7 mil; BSD-2-Clause | Alinhamento por palavra e identificação de falantes. | Depois da primeira transcrição; inclui dependências/modelos adicionais. Diarização tem condições próprias e não é requisito do primeiro ciclo. |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | ~199,3 mil; Unlicense no repositório | Obter mídia de link com metadados, progresso e integração posterior ao armazenamento local. | Quando a etapa YouTube for executada; considerar os requisitos de runtime JavaScript documentados e o build distribuído. |
| [Auto-Editor](https://github.com/WyattBlue/auto-editor) | ~5,6 mil; Unlicense | Cortes automáticos por análise, especialmente pausas/silêncio. | Posterior; não equivale a encontrar momentos semanticamente interessantes. |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | ~5,3 mil; BSD-3-Clause | Detectar mudanças de cena e ajudar a evitar cortes visuais ruins. | Posterior; não identifica sozinho o valor de um trecho nem rastreia falantes. |

Sinais concretos de manutenção consultados: whisper.cpp releases com v1.9.5 marcada Latest, publicada em 6 de outubro; faster-whisper lista 1.2.1 como Latest; yt-dlp lista 2026.08.19; PySceneDetect documenta 0.7.2 em 11 de outubro de 2026. Não foi obtido histórico de crescimento de estrelas. API de commits do OpenClipper não respondeu nesta consulta, portanto não há conclusão sobre frequência recente de commits dele.

## Como avançar sem reiniciar o projeto — sequência histórica da pesquisa

1. Fechar a validação pendente das correções da entrada M2A, conforme orçamento autorizado. Diferenciar o erro do harness dos defeitos do produto.
2. Implementar uma transcrição local real de vídeo persistido, com adaptador isolado, idioma/timestamps, cancelamento, persistência e recuperação. Confirmar flags no executável selecionado, sem copiar exemplos incompatíveis de outros planos.
3. Exportar um trecho MP4 real com FFmpeg, inicialmente sem efeitos avançados; depois aplicar legendas ASS/SRT com os tempos da transcrição. Fonte, modelo e tempo do preview precisam corresponder ao arquivo exportado.
4. Integrar download real de YouTube via adaptador próprio, quando autorizado: URL → job → arquivo validado → armazenamento de mídia existente. Não usar iframe como prova de importação. Requer critérios para erros da origem, cancelamento e retomada/retry; sem automatizar credenciais do navegador.
5. Só então acrescentar seleção semântica de melhores momentos e reenquadramento. Auto-Editor e PySceneDetect resolvem partes diferentes desse problema; não representam um motor de viralidade pronto.

Aceite do primeiro ciclo: importar um arquivo, reiniciar/reabrir, transcrever fala em português, buscar e navegar na transcrição, escolher legendas e exportar um MP4 reproduzível. Um resultado real por fatia vale mais que instalar vários aplicativos de referência.

## Licença e procedência

SupoClip e ViralMint declaram AGPL-3.0; MIT/BSD/Unlicense também têm condições que precisam ser verificadas na versão escolhida. Não copiar código antes de registrar origem, versão/commit, licença e adequação à distribuição planejada. Conferir separadamente dependências, binários, modelos, fontes e outros assets. Não concluir compatibilidade comercial apenas pelo rótulo open source. A licença do repositório yt-dlp ou Auto-Editor não descreve sozinha todas as licenças dos executáveis empacotados.

## Fontes e limites

Fontes principais: links de cada linha da tabela, READMEs e páginas de releases oficiais. Consultado adicionalmente: [OpenClipper Cargo.toml](https://raw.githubusercontent.com/GrepCut/OpenClipper/master/src-tauri/Cargo.toml), [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases), [faster-whisper releases](https://github.com/SYSTRAN/faster-whisper/releases), [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases). Algumas leituras de arquivos individuais de SupoClip/ViralMint e API de commits falharam; avaliações desses casos permanecem documentais. Esta comparação não é auditoria de segurança nem teste de desempenho ou qualidade dos aplicativos.


## Timeline e vídeos longos — estudo de módulos, 2026-10-22

### Escopo, evidências e conclusão

Pesquisa solicitada pelo mantenedor para orientar o ZCode, sem implementar correções. Foram lidos 17 arquivos em quatro repositórios, em revisões fixadas, além de documentação oficial. Inventário com URLs, revisões, linhas e SHA-256: `docs/reports/evidence/timeline-research-2026-10-22/sources.json`. Prompt: `prompt-zcode.txt` no mesmo diretório.

Os aplicativos externos não foram instalados nem comparados em benchmark. Nenhum teste deles foi executado. O estudo de módulos abaixo não transforma os catálogos históricos acima em revisão completa de outros projetos. Não existe evidência pública suficiente aqui para descrever a arquitetura interna do editor do OpusClip.

A melhor sequência proposta para a stack atual é corrigir leitura parcial de mídia, autoridade do tempo solicitado e trabalho de UI por frame; medir o custo residual de decodificação e, se necessário, acrescentar proxy de edição com FFmpeg. Proxies não corrigem uma resposta Range que lê o arquivo inteiro, e limitar renders não corrige disputa entre eventos de tempo. Nenhum desses fatores deve ser apontado como causa única dos picos sem medição.

### 1. Tauri — protocolo de mídia por intervalos

- Origem: [tauri-apps/tauri](https://github.com/tauri-apps/tauri), revisão `ba1e205f3bfba19a9cbe6032bb4ece3068429d04` (branch dev consultada; não é proposta de upgrade).
- Arquivos: `examples/streaming/main.rs` e `crates/tauri/src/protocol/asset.rs`.
- Fluxo efetivamente estudado: handler recebe URI/método/Range; abre arquivo, usa metadados e interpreta intervalos. No ramo de intervalo único, limita o comprimento a `1000 * 1024`, faz seek no arquivo e lê com `take(nbytes).read_to_end`. Produz 206 com Content-Range/Content-Length; intervalo não satisfazível produz 416. O limite é por trecho, não orçamento total de concorrência.
- Contrato: arquivo autorizado + intervalo em bytes -> corpo parcial + cabeçalhos coerentes. Entradas sem Range e múltiplos intervalos seguem ramos distintos; HEAD e erros precisam ser examinados separadamente.
- Ressalva importante: o ramo sem Range em `asset.rs` ainda lê o arquivo inteiro. Multipart também não demonstra limite agregado global. Não copiar o handler como garantia de memória limitada para todos os casos; aplicar semântica da RFC e orçamento explícito.
- Dependências relevantes: std::fs/File, Read/Seek, HTTP, http_range e infer. MIT OU Apache-2.0 nos arquivos consultados; verificar compatibilidade com a versão instalada, sem introduzir dependência só por reproduzir o exemplo.
- Testes observados: `multi_range_request` verifica estrutura da resposta multipart; `empty_path_request` verifica rejeição de caminho. Nenhum executado; não são prova de estabilidade de RAM.
- Adaptação proposta: substituir leitura integral + cópia do `cnplocal` por leitura parcial limitada, mantendo autorização de caminhos e protocolo do app. Testar bytes efetivamente lidos, HEAD, suffix/open ranges, arquivo vazio, erros e concorrência. Comportamento sem Range deve ser eficiente e correto, nunca 200 truncado.

Fonte: [handler asset fixado](https://github.com/tauri-apps/tauri/blob/ba1e205f3bfba19a9cbe6032bb4ece3068429d04/crates/tauri/src/protocol/asset.rs), [RFC 9110 — Range](https://www.rfc-editor.org/rfc/rfc9110.html#name-range).

### 2. OpenCut Classic — playback, playhead e cache de vídeo

- Origem: [OpenCut-app/opencut-classic](https://github.com/OpenCut-app/opencut-classic), revisão `cf5e79e919144200294fb9fed22a222592a0aeea`. Repositório arquivado: referência histórica delimitada, não dependência recomendada para instalar.
- Arquivos centrais: `apps/web/src/core/managers/playback-manager.ts`; `apps/web/src/timeline/controllers/playhead-controller.ts`; `apps/web/src/timeline/hooks/use-timeline-playhead.ts`; `apps/web/src/timeline/components/timeline-playhead.tsx`; `apps/web/src/services/video-cache/service.ts`.
- Complementos lidos: `apps/web/package.json`, `LICENSE` e `services/renderer/nodes/video-node.ts`. Este último é uma classe pequena sem pipeline implementado suficiente para fundamentar conclusões de render.
- PlaybackManager separa listeners de estado, atualização de tempo e seek. Mantém isPlaying/currentTime/isScrubbing e âncora temporal da reprodução. PlayheadController mantém sessão de scrub e última posição; `updatePlayheadLeft` altera diretamente o estilo do elemento. Não obriga toda a árvore React a renderizar a cada atualização do playhead. Hook mantém controller/config e remove inscrições no teardown.
- Contrato: atualizações do relógio de reprodução e interação -> posição visual e eventos de seek. A separação de responsabilidades é aproveitável; não foi demonstrado que implementa exatamente o protocolo de confirmação solicitado/confirmado necessário ao nosso HTMLVideoElement.
- VideoCache recebe mídia/tempo e retorna frame. Deduplica inicialização por Promise; usa geração para descartar solicitações enfileiradas obsoletas; serializa trabalho em frameChain. Mantém frame atual/próximo e CanvasSink com poolSize 3. Busca local para avanço curto e reposiciona iterator para saltos/reversão.
- Limites: geração descarta trabalho obsoleto ainda enfileirado, não prova cancelamento do decoder já ativo. Pool de três canvases por sink não limita toda a RAM do editor; mapa de sinks não apresenta LRU global nesse arquivo. Dispose/clearVideo/clearAll liberam recursos explicitamente.
- Dependências observadas: aplicação Next/React, Mediabunny ^1.29.1 e opencut-wasm ^0.2.10, entre outras. Não são substituição direta do Tauri/HTMLVideoElement. Licença MIT no LICENSE lido; dependências e binários exigem avaliação própria antes de adoção.
- Testes: busca na árvore consultada não identificou testes específicos pelos nomes playback/playhead/video-cache; isso não prova ausência de testes no projeto inteiro. Nenhum executado.
- Adaptação proposta: separar reprodução, intenção de seek e posição visual; reduzir o caminho quente do playhead e descartar trabalho obsoleto. Implementar primeiro no adaptador atual; não instalar Mediabunny automaticamente.
- **Adoção registrada (2026-10-22, tarefa timeline):** o mecanismo do VideoCache
  (geração p/ descartar pedidos obsoletos, frameChain serializado, frame
  atual/próximo, busca sequencial p/ avanço curto e reposicionamento do iterator
  em saltos) foi adaptado em `app/src/lib/frame-seeker.ts` com a dependência
  `mediabunny` ^1.62.1 (MIT — mesma família usada pelo OpenCut Classic ^1.29.1;
  wrappers WebCodecs/demuxer). Motivação: o `<video>` decoda do keyframe até o
  alvo em H.264 1080p; o FrameSeeker decoda só o frame alvo para a prévia do
  scrub (overlay), mantendo o `<video>` como autoridade de playback/áudio.
  Justificativa e medidas no relatório da tarefa timeline
  (`docs/reports/history/`, 2026-10-22) e evidência
  `docs/reports/evidence/goal-timeline-2026-10-22/`.

Fontes: [PlayheadController](https://github.com/OpenCut-app/opencut-classic/blob/cf5e79e919144200294fb9fed22a222592a0aeea/apps/web/src/timeline/controllers/playhead-controller.ts), [VideoCache](https://github.com/OpenCut-app/opencut-classic/blob/cf5e79e919144200294fb9fed22a222592a0aeea/apps/web/src/services/video-cache/service.ts).

### 2b. AutoClip (zhouxiaoka) e AutoClip (artbyjazi) — pipeline de cortes, fronteiras e enquadramento (2026-10-23)

Origem: zhouxiaoka/autoclip rev `3d3b5edf9ffa595a764b0919e6dbd4ce8acaca84`
(2026-10-22, tag mcp-v1.5.7) e artbyjazi/autoclip rev `5d0eac36fa615b79dd2104083bf273a96f8d68bb`
(2026-08-01), ambos MIT; clones isolados em `.tooling/vendor/refs-autoclip/`.
Cobertura por arquivo, lacunas declaradas e matriz por capacidade:
`docs/reports/evidence/goal-recuperacao-autoclip-2026-10-23/g4-estudo-autoclip.md`
e `g5-matriz-comparacao.md`. Nenhum código foi EXECUTADO (estudo estático).

- Seleção: one-pass com janelas sobrepostas (zhou: 60 min/70 k chars nuvem,
  20 min/12 k chars local; payload compacto `id|tempo|texto`, ~40 % menos
  tokens que SRT); legado 6 passos como fallback; jazi: 8 min/60 s com
  concorrência local=1 (GPU saturada). Qualidade programática determinística
  (zhou `quality.py`): snap de fronteiras a cues, merge por sobreposição,
  clamp de duração por tier, seleção threshold 0,7 + min_keep/max_clips,
  fallback SEMPRE marcado. Fronteiras por frase+pausa (`boundaries.py` de
  ambos; jazi alinha cortes a silêncio medido). Drop de pergunta final que
  pertence ao próximo tópico (zhou).
- Enquadramento 9:16 por plano: zhou = YuNet ONNX (MIT) + boca-que-se-move =
  falante, sem rosto → fit com fundo borrado; jazi = landmarks + tracks +
  diarização ("never jarring", biased to stillness). Ambos superam nossa
  prova de conceito M4 (centro único), que permanece FORA do caminho padrão.
- ASR: faster-whisper sob demanda com progresso por segmento; LLM:
  cloud-first com presets Ollama/LM Studio (zhou) vs local-first (jazi).
  Cancelamento maduro no zhou (bind/checkpoint + limpeza pós-delete).
- Adaptações registradas para o CutNicePro (propostas, ainda não
  implementadas): payload compacto de seleção, refine determinístico de
  fronteiras (frase+pausa; insumos já existem — word-level do Whisper +
  silencedetect), reuso do modelo via server sem mmproj (exige ganho medido).

### 3. Kdenlive — cache limitado e proxy em background

- Origem: [KDE/kdenlive](https://github.com/KDE/kdenlive), revisão `80b74ffa95390f4cc8d75a4e886e7ff47373583e`.
- Arquivos: `src/utils/thumbnailcache.cpp`, `src/jobs/proxytask.cpp`, `src/jobs/proxytask.h`, `src/monitor/monitorproxy.cpp` e `src/monitor/monitorproxy.h`. Leitura do monitor foi complementar; não se afirma equivalência entre sua sincronização MLT e nosso elemento de vídeo.
- ThumbnailCache: estrutura indexada por chave e lista; get move o item para a frente, insert rejeita item maior que orçamento e remove itens do fim enquanto excede custo. Inserção de QImage usa sizeInBytes. O cache volátil é construído com custo máximo 10000000; isso não representa teto de RAM de todo Kdenlive.
- Contrato: chave -> imagem cacheada, com custo contabilizado; armazenamento volátil e em disco são capacidades separadas. Adaptar orçamento proporcional, não o número literal como garantia geral.
- ProxyTask::start deduplica job pendente por owner/tipo. run identifica original e destino separados, considera cache existente, executa processo e acompanha progresso. Cancelamento encerra processo próprio; falha/arquivo vazio não publica proxy como sucesso. Troca de produtor ocorre após sucesso. Perfis e fallback de hardware são específicos do projeto.
- Contrato: mídia original + perfil -> derivado leve para edição. Original permanece ativo do usuário e é referência para render final, conforme documentação oficial.
- Dependências: Qt/MLT/Kdenlive job infrastructure e FFmpeg. Não portar essa arquitetura para o CutNicePro.
- Licença nos arquivos: GPL-3.0-only OU LicenseRef-KDE-Accepted-GPL. Usar como referência conceitual e implementar solução própria; não autoriza cópia indiscriminada para outro produto.
- Testes: árvore apresenta diálogo proxytest e dataset missing-proxy; não foram estudados como testes automatizados do comportamento nem executados. Fluxos de erro/cancelamento acima vêm do código do job.
- Adaptação proposta: job de proxy cancelável/deduplicado, cache com chave de fonte/perfil, validação e publicação atômica; preview pelo proxy e export pelo original. Definir política de descarte e espaço em disco. Medir perfil/resolução/GOP para a mídia e hardware reais.

Fontes: [ThumbnailCache](https://github.com/KDE/kdenlive/blob/80b74ffa95390f4cc8d75a4e886e7ff47373583e/src/utils/thumbnailcache.cpp), [ProxyTask](https://github.com/KDE/kdenlive/blob/80b74ffa95390f4cc8d75a4e886e7ff47373583e/src/jobs/proxytask.cpp), [documentação de proxies](https://docs.kdenlive.org/en/project_and_asset_management/project_settings/proxy_settings.html), [categorias de cache](https://docs.kdenlive.org/en/project_and_asset_management/project_settings/tab_cache_data.html).

### 4. Remotion Player e alternativas de decode

- Origem: [remotion-dev/remotion](https://github.com/remotion-dev/remotion), revisão `3ab34665c49279cc35820275380983068bb1bbf9`.
- Arquivos: `packages/player/src/Player.tsx` e `LICENSE.md`.
- Player.tsx mantém frame em estado/ref e stores separados de reprodução/buffering; passa setFrame e setFrameWithoutSeek por contextos. Estudo restrito ao componente de composição do Player, sem auditar hooks/decoder de ponta a ponta.
- Contrato observado: configuração/composição -> Player com contextos de frame, reprodução, buffering e controles. Não prova performance de scrub na máquina do mantenedor.
- Dependência de ecossistema Remotion/React; licença própria, com condições e restrições de redistribuição de código. Referência conceitual, sem proposta de copiar código ou adicionar Remotion ao produto.
- Consulta da árvore completa falhou no conector (Transport closed); arquivos individuais foram lidos em seguida. Nenhum teste executado.
- Documentação de playback alerta para custo de prefetch/premount excessivo; não assumir que carregar mais frames sempre melhora fluidez.
- Mediabunny documenta leituras sob demanda e descarte explícito de Input/VideoSample; pool de CanvasSink e VideoFrame.close ajudam a controlar recursos, mas exigem gerenciamento de ciclo de vida e compatibilidade. São alternativa futura a comparar, não migração aprovada.

Fontes: [Player fixado](https://github.com/remotion-dev/remotion/blob/3ab34665c49279cc35820275380983068bb1bbf9/packages/player/src/Player.tsx), [playback issues](https://www.remotion.dev/docs/player/playback-issues), [leitura de mídia](https://mediabunny.dev/guide/reading-media-files), [media sinks](https://mediabunny.dev/guide/media-sinks), [VideoFrame.close](https://developer.mozilla.org/en-US/docs/Web/API/VideoFrame/close).

### Cruzamento com o CutNicePro e aceite proposto

Diagnóstico estático anterior: `docs/reports/evidence/timeline-static-2026-10-22/analysis.txt`. Caminhos principais: `local_media_scheme.rs`, `VideoEditor.tsx`, `VideoPreview.tsx`, `TimelineSurface.tsx`, `TranscriptPanel.tsx`.

1. I/O: leitura completa por requisição antes de Range é defeito estrutural verificável; contribuição quantitativa aos picos exige runtime.
2. Tempo: alvo solicitado e eventos intermediários compartilham estado; hipótese forte para o snapback, sem trace que prove sequência exata.
3. Render: debounce não equivale a throttle nem impede render da árvore por outros props/callbacks; não há ganho de 8,5x demonstrado.
4. Decode: avaliar depois dos três anteriores. O módulo chamado media_proxy no app controla acesso a arquivos de cache, não é proxy de edição transcodificado.

Critérios propostos, não resultados: playhead p95 <=50 ms; prévia com proxy pronto p95 <=250 ms no hardware identificado; sem snapback; ausência de crescimento monotônico entre ciclos delimitados. Precisão temporal segundo FPS/timebase e preservação da mídia/exportação. Memória deve ser medida no conjunto de processos do app e WebView2, separando buffers, React e decoder quando possível. Duração do vídeo não deve exigir carregar todos os frames; tamanho, codec, GOP e quantidade de elementos afetam custos distintos.

Teste runtime: build identificado sem HMR, vídeo de 24 min e de 2 h quando disponível; origem sintética explicitada; baseline, scrub e repouso; orçamento seguro antes de iniciar. Sem execução real, correção continua PARTIAL/BLOCKED. Aprovação estética continua humana.

Documentação adicional: [WebView2 performance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/performance), [React external store](https://react.dev/reference/react/useSyncExternalStore). Nenhuma dessas fontes comprova por si só o desempenho do CutNicePro.


### Direcionamento adicional — rastrear o fluxo completo do OpenCut (2026-10-22)

- Pedido do mantenedor: o ZCode deve estudar o editor e suas dependências até o frame apresentado, comparar todo o caminho de mídia com CutNicePro e implementar correções com runtime. O estudo delimitado anterior não constitui essa auditoria completa.
- Nova conferência: README de OpenCut em `e668010778568641babef2cc40be4703ae6916d6` informa que opencut.app usa Classic; a reescrita com núcleo Rust usa new.opencut.app. SHA exato do deploy não identificado. Classic consultado permanece `cf5e79e919144200294fb9fed22a222592a0aeea`; package.json lista Next/React/Mediabunny/opencut-wasm. Isso não prova quais dependências executam cada etapa.
- Prompt `docs/reports/evidence/opencut-fluxo-completo-2026-10-22/prompt-zcode.txt`: mapear rota/importação, relógios, eventos, decode/composição, cache, recursos e cleanup; seguir implementações herdadas e dependências resolvidas pelo lock; produzir matriz comparativa; medir a mesma mídia com latência de playhead separada da prévia.
- A fluidez relatada no OpenCut vem do mantenedor. Nenhum dos dois aplicativos foi executado nesta tarefa. Correções do relatório ZCode 1500 não foram auditadas novamente aqui. Não concluir equivalência de stack nem atribuir desempenho a Rust/servidores sem caminho de execução.
- Fontes conferidas e hashes em sources.json na mesma pasta. Sem alteração de aplicativo, dependências, versão ou index. Próximo passo: executar o prompt no ZCode com os critérios de rastreio completo e validação real.


### Revisão do relato “Blob URL resolve o gargalo” — 2026-10-22

O código atual foi conferido: useWorkspaceData faz fetch(schemeUrl).blob() antes de criar a URL; Rust ainda lê o arquivo integral no caminho sem Range, usa intervalo aberto sem teto e ignora múltiplos ranges com retorno 200 completo. O relatório chamar isso de “rejeição” não corresponde a esse ramo. O custo real da aquisição/memória não foi medido.

Object URL é uma referência à fonte, não especificação de demux/decode/render. OpenCut Classic mantém VideoCache com Input/BlobSource/CanvasSink, geração/serialização de pedidos e pool; a cadeia completa até o frame apresentado deve ser rastreada. A presença de object URLs nos dois apps não prova equivalência.

Documentação consultada: [createObjectURL](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static), [File](https://developer.mozilla.org/en-US/docs/Web/API/File), [Response.blob](https://developer.mozilla.org/en-US/docs/Web/API/Response/blob). Response.blob lê a resposta até o fim; não concluir que todos os bytes permanecem necessariamente em RAM, pois o backing store exige medição.

Detalhes e limites em `docs/reports/evidence/revisao-blob-timeline-2026-10-22/analysis.txt`. Novo prompt pede experimento controlado: OpenCut, vídeo mínimo no WebView2 com a mesma fonte e editor completo, antes de outra correção. Nenhum benchmark/correção nesta revisão.

### Preparação de integração multimodal — 2026-10-23

Leitura preparatória, sem execução de modelo ou adoção de dependências. Inventário e hashes em `docs/reports/evidence/goal-cortes-multimodais-2026-10-23/sources.json`; direcionamento completo no `objetivo-zcode.txt` dessa pasta.

- **Gemma:** o [model card oficial](https://ai.google.dev/gemma/docs/core/model_card_4) não comprova suporte do backend instalado. No CutNicePro, `clips/text_engine.rs::generate_with` recebe texto e schema, usa `-f/-jf` e contexto 8192. A primeira etapa proposta é verificar entradas visuais/sonoras reais no runtime.
- **llama.cpp:** [README de mtmd](https://github.com/ggml-org/llama.cpp/blob/master/tools/mtmd/README.md) descreve a infraestrutura multimodal; componentes dependem da arquitetura. Compatibilidade do artefato Gemma instalado ainda não verificada. Não deduzir suporte apenas pelo nome do modelo.
- **ByteTrack:** leitura delimitada de [byte_tracker.py](https://github.com/FoundationVision/ByteTrack/blob/main/yolox/tracker/byte_tracker.py): `BYTETracker.update(output_results, img_info, img_size)` recebe detecções e faz associação temporal; `STrack` utiliza Kalman. Não é detector ou associação de falante. [LICENSE](https://github.com/FoundationVision/ByteTrack/blob/main/LICENSE) consultado é MIT; pesos e dependências precisam de avaliação própria. Referência candidata, sem decisão de instalação.
- **OpusClip:** [ClipAnything](https://www.opus.pro/clipanything) é referência de comportamento solicitado. Sua página pública não demonstra arquitetura interna, custo de processamento ou desempenho comparável.
- **Aplicação:** `clips/scene_regions.rs` refina bordas por transições FFmpeg; isso não demonstra tracking. `clips/types.rs` e `EditorTimeline.tsx` consultados representam intervalo/trim; plano com múltiplos intervalos exige rastreio adicional pelo implementador.

Branches externos consultados são móveis; hashes do conteúdo constam no inventário. Antes de adaptar código, o ZCode deve fixar revisões, seguir dependências relevantes e validar licença/contratos/testes. Não se afirma estudo completo ou integração destas referências.
