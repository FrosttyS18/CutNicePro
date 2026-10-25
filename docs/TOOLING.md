# CutNicePro — Tooling

Ambiente inicialmente preparado em 2026-10-17. **Naquele setup, isolamento no projeto com uma exceção autorizada: os
hooks de proteção rodam no escopo USER do ZCode** (`~/.zcode/cli/config.json`, autorização
expressa de 2026-10-17) e invocam scripts versionados neste repositório; fora do workspace
`C:\CutNicePro` eles são no-op e podem ser desativados pelo toggle de hooks. Fora isso,
o setup original não fez instalação global de npm/uv nem alteração de PATH/config globais. Posteriormente, ENGINE-DECISIONS.md §1 registrou instalação autorizada de FFmpeg via WinGet fora do workspace; esse é histórico específico, não autorização geral para novas instalações. A revisão documental 03N não instala ou modifica ferramentas.

## Abrir o aplicativo e controlar espaço — 2026-10-24

Reteste solicitado pelo mantenedor em 2026-10-25: as amostras de laboratório são arquivos, não projetos inseridos no perfil normal. Caminhos absolutos existentes da entrega anterior: `C:/CutNicePro/.tooling/test-output/pipelines-comparados-2026-10-24/native-full-davyjones/Qwen35-4B-Q4-davyjones-round1-01.mp4` e `Qwen35-4B-Q4-davyjones-round1-02.mp4` na mesma pasta; oito MP4s de UX em `C:/CutNicePro/.tooling/test-output/pipelines-comparados-2026-10-24/native-full-ux/`. O segundo Davy foi reprovado pelo mantenedor e não é amostra editorial aprovada. Ensaios desta correção ficam em `C:/CutNicePro/.tooling/test-output/feedback-editorial-2026-10-25/`, com pastas separadas por configuração e sem cópias do perfil do usuário. A build continua exclusivamente em `app/src-tauri/target`; autorização permanente de fechamento normal pelo agente registrada no AGENTS.md, sem encerrar processos alheios.

### Motor textual atual — migração Qwen3.5 em validação, 2026-10-24

Limites da geração atualizados por pedido do mantenedor em 2026-10-25: até 16 sugestões por execução, com versões sobrepostas/contidas permitidas. Mesmo teto no contrato Rust, formulário personalizado, descoberta/schema e lote de enquadramento facial; as 12 amostras por corte são outro limite e permanecem. Não há teto acumulado na biblioteca nem novo modelo/servidor por essa mudança. Bordas/cenas refinam cada versão sem recortar para caber no corte vizinho. Teto não é quota; piso, completude e fidelidade permanecem obrigatórios.

Inventário adicional autorizado em 2026-10-25: Ministral 3 8B Instruct 2512 Q4_K_M oficial baixado em `C:/CutNicePro/experiments/clip-selection-ab/models/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf`, 5.198.911.904 bytes, SHA-256 `33e7a72cf5e6e2cfc2f2847075acc013d68bba023e35310cef86b5cf8fdca761`, revisão `0102285ad796bd99af90f58de616092e5630e970`, Apache-2.0. Arquivo ignorado pelo Git, sem mmproj, dependência instalada ou configuração global. Executado pelo b11829 existente com template Jinja nativo e temperatura 0,05; somente laboratório, não disponível no seletor nem motor normal. Fonte integral cabe em 16K nos dois controles (7701/3313 tokens + saída até 4096). Não usar 64K FP16 automaticamente: cache dessa arquitetura já exigiria ~8,5 GiB antes dos pesos. Resultados 5 propostas livres/8 estruturadas continuam com erros editoriais; detalhes no handoff e `reports/evidence/editorial-stories-2026-10-25.json`.

Qwen3.5-9B existente também foi testado com contexto 65536 real, pedido humano integral e sem filtros/JSON: 4 propostas em 54,45 s, com omissões e falas finais fora dos tempos. Nenhuma promoção de default. Na configuração normal permanece Qwen3.5-4B/32K. Picos documentados são WorkingSet do processo e memória TOTAL da GPU; não misturar esses números com medições históricas de RAM do grupo do app. Nenhum servidor de inferência mantido aberto por esses ensaios.

Decisão expressa do mantenedor: Qwen3.5-4B exclusivo, sem novos testes com Qwen3 antigo, e retirada do Gemma 4. Modelo único baixado em experiments/clip-selection-ab/models/Qwen3.5-4B-Q4_K_M.gguf (2.740.937.888 bytes), SHA-256 00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4. Quantização Unsloth e revisão/base/licença em docs/reports/evidence/qwen35-modelo-2026-10-24.json; licença oficial em docs/references/Qwen3.5-4B-LICENSE.txt. Pesos do Gemma 4, mmproj e engine-gemma.json removidos (6,6599 GiB lógicos), inventário em gemma4-retirado-2026-10-24.json. Qwen3 e Instruct-2507 antigos continuam apenas como arquivos históricos inativos; não são usados pela descoberta do motor.

O adaptador atual solicita Qwen3.5 instruct/nothink, contexto 32768 sem redução automática por fit, até seis threads, Vulkan quando disponível e uma tentativa CPU após falha de GPU, com registro explícito. Não há modelo externo, download automático, mmproj ou fallback para Gemma/Qwen3. Pedidos antigos de quality são aliases para Qwen3.5; metadados de origem dos cortes antigos permanecem legíveis. A descoberta recebe a transcrição inteira numa entrada, com verificação real de tokens; texto que não cabe gera erro explícito, sem truncagem/divisão. Novos cortes não substituem os anteriores.

Calibração de 2026-10-25: descoberta/reparo usam temperatura 0,4, avaliação/análise 0,7; top_k 20, top_p 0,8, min_p 0, presence 1,5 e seed 42 mantidos. Controle mudou apenas temperatura nas mesmas duas fontes integrais; maior localização literal não equivale a aprovação editorial. Metadados `sampling` identificam as etapas; resultados antigos mantêm seu registro original.

### Comparação pontual com Coding Plan da Z.ai — 2026-10-25

Autorizada pelo mantenedor somente para diagnóstico via Codex: endpoint `https://api.z.ai/api/coding/paas/v4/chat/completions`, modelo `glm-5.3-flash`, sem chamar API comum, trocar plano ou integrar provedor ao app. Documentação oficial confirma o modelo e exige thinking enabled. Teste de conexão com chave nova: HTTP 200, 2,83 s. Comparação em thinking low/temp 1/top_p 0,95: transcrição inteira de 334 segmentos em todas as três chamadas; 11 propostas em 10,64 s, 10 localizadas exatamente/na faixa técnica, mas com vários começos/finais inadequados. Avaliação do T-PAP 17 s recusou corretamente o intervalo; 149,40–227,66 s foi considerado completo. JSON object sem gramática igual à local e thinking diferem do Qwen; não é comparação isolada dos pesos nem integração validada. Primeiro ensaio max não gerou JSON utilizável pelo harness e não permite inferir qualidade. Chaves recebidas somente em entrada sem eco, não persistidas; scripts/resultados ignorados em `.tooling/test-output/feedback-editorial-2026-10-25/`. Nenhum arquivo global/config do Codex/ZCode foi alterado. Fontes: [modelo](https://docs.z.ai/guides/vlm/glm-5.3-flash), [endpoint no ZCode](https://zcode.z.ai/en/docs/configuration), [ferramentas e escopo do Coding Plan](https://docs.z.ai/devpack/tool/others).

Um quarto caso usou exatamente as mensagens do Qwen para o T-PAP 149,40–197,80 s: GLM aprovou em 10,59 s, mas incluiu no resumo a falta de revisão discutida após o intervalo. Não atribuir o defeito exclusivamente ao Qwen nem considerar as 11 propostas prontas para publicar. A revisão narrativa experimental fica somente em cfg(test); build normal recompilada e SHA no handoff.

Prova inicial em servidor local: 24,61 s/6 propostas em instruct; 40,90 s/4 em thinking com prompt já em cache. Pico WorkingSet do servidor 3769,16 MiB; não é RAM do aplicativo nem VRAM e não vale como benchmark causal. A produção preserva ProcessControl e CLI por chamada: os ensaios de geração 1/2 levaram 29,48/34,00 s, dois novos cada, porém títulos/conteúdo foram reprovados na auditoria. Ensaios 3–5 de novas bordas falharam na conferência literal; correção de apresentação/decodificação em validação. Não afirmar qualidade aprovada nem recomendar a build anterior como Qwen3.5. Status atualizado no ENGINE-HANDOFF.

A referência editorial do assistente foi aprovada pelo mantenedor: seis propostas, duas dependentes de imagem, em docs/reports/evidence/criterio-editorial-assistente-2026-10-24.json. Não é saída do Qwen nem aprovação de MP4. Estudos e comparações externas anteriores são históricos; os processos com chaves em memória foram encerrados. Nenhuma chave foi integrada à aplicação.

Comparação 9B expressamente autorizada: `experiments/clip-selection-ab/models/Qwen3.5-9B-Q4_K_M.gguf`, 5.680.522.464 bytes, SHA-256 `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8`. Procedência e resultados em `docs/reports/evidence/qwen35-9b-comparacao-2026-10-24.json`. O ensaio não demonstrou ganho editorial; 9B continua apenas no laboratório, sem mudar o default 4B nem criar outra build do aplicativo.

Experimento de backend: `.tooling/vendor/llamacpp-b11829-cuda` contém somente o runtime portátil oficial do llama.cpp b11829 e suas bibliotecas CUDA 13.4, extraídos de dois pacotes com digest conferido na release. Não instalou toolkit/driver, não alterou PATH e não é um target alternativo do app. O controle executou na RTX 5070, mas continuou errando fatos e bordas. Produção permanece no runtime Vulkan com fallback CPU; dados CUDA não são benchmark de RAM total nem aceite editorial. Provas e limites em `geracao-incremental-modelos-2026-10-24.json`.

Build canônica atualizada ao fim deste checkpoint: `app/src-tauri/target/debug/cutnicepro.exe`, SHA-256 `F170AB89178747C81B44A5CEB5D11D4C56092CE6209FCF07906D43659EB7757D`, compilação/check/fmt sem avisos e testes Rust 186/186 (18 opt-in). O app não foi aberto automaticamente. O comando habitual continua `npm run tauri dev` em `C:/CutNicePro/app`, sem target/profile alternativo. Esse build contém a migração, mas não é uma entrega de qualidade editorial aprovada: a última geração isolada ainda terminou sem cortes. Os ZIPs temporários próprios CUDA foram removidos; pesos 4B/9B e runtimes permanecem identificados, sem apagar dados do mantenedor.

### Laboratório dos pipelines completos — 2026-10-24

Referências originais isoladas em `.tooling/vendor/refs-pipelines/{autoclip,supoclip}`; ambiente de teste `.tooling/venvs/pipeline-comparison`. Este ambiente reutiliza pacotes instalados de `C:/SupoClipLab/supoclip/backend/.venv-lab` somente por leitura e instala suas próprias dependências faltantes, sem alterar o laboratório externo. Python 3.12, OpenCV 4.12.0.88/NumPy 2.2.6 e Pillow no ambiente isolado. Isso não é dependência nova do aplicativo nem uma instalação portátil pronta das referências. Revisões, licenças, configuração e limitações em OPEN-SOURCE-ENGINE-RESEARCH e no manifesto `docs/reports/evidence/pipelines-comparados-2026-10-24.json`.

O caso AutoClip sem SRT também reutiliza, por leitura, faster-whisper do ambiente `.tooling/venvs/asr-evaluation`; pesos Base exclusivos dessa referência ficam em seu próprio `data/whisper-models`, revisão Systran `ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66`. Inferência CPU INT8 original com duas threads e Qwen local; nenhum transcritor do app foi substituído. A preparação pública do modelo é separada da execução offline.

Fontes copiadas para os testes, SQLite/projetos das referências, logs e MP4s ficam em `.tooling/test-output/pipelines-comparados-2026-10-24`. Não são projetos da biblioteca normal e nunca devem ser apresentados como se estivessem no perfil do mantenedor. Testes nativos opt-in em `clips/comparison_runtime_tests.rs` exercitam o próprio motor, salvar/reabrir/regenerar/exportar, sem automação da interface. Não executar novamente casos concluídos apenas para melhorar evidência.

Controle adicional de quantização: `experiments/clip-selection-ab/models/Qwen3.5-4B-Q8_0.gguf`, 4.482.403.488 bytes, SHA-256 `10cc391b403021dd11c614679d2fd92f611c3681d29e29651b717316965d61e1`, mesma revisão Unsloth `e87f176479d0855a907a41277aca2f8ee7a09523`. Não demonstrou correção editorial e NÃO foi promovido. O app continua carregando exclusivamente Q4_K_M. Os servidores locais usados na comparação foram encerrados pelos próprios runners; não há serviço de nuvem ou servidor permanente instalado. A build continua única em `app/src-tauri/target`; não abrir executáveis de laboratório para o aceite normal.

### Build e lint sem avisos — 2026-10-24

Verificação adicional posterior: `cargo clippy --all-targets -- -D warnings` retornou FAIL com 19 diagnósticos em trechos já presentes no HEAD (assinaturas longas, documentação/listas, tipos complexos e estilo de testes em borders/editorial_repair/scene_regions/selection/tracking/render/transcription). Não houve execução do Clippy sobre checkout antigo; a origem anterior foi conferida no código/diff. O build normal Rust, TypeScript/Vite e ESLint passaram. A falha do Clippy está registrada como dívida separada no BACKLOG, sem suprimir lint ou refatorar essas rotinas para encerrar esta fatia.

O build padrão e o lint foram limpos sem desabilitar regras ou aumentar limites. `npm run build` valida TypeScript e Vite; `npx eslint src --max-warnings 0` verifica o frontend. O gate tools/ci/lint-budget.mjs agora aceita zero erros e zero avisos. No backend, cargo check --all-targets, cargo fmt --all -- --check e cargo build foram executados no target padrão, sem warnings; os testes Rust passaram. Isso não representa execução de todos os lints opcionais, empacotamento release nem aceite visual/editorial.

As bibliotecas React, motion, Three e mediabunny permanecem nas versões existentes, separadas em chunks menores que 500 kB; o maior tem 416.769 bytes. O carregamento das rotas e os algoritmos de geração/timeline não foram trocados. Referências técnicas: [ajuste de estado no React](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes), [sincronização antes da pintura](https://react.dev/reference/react/useLayoutEffect) e [manualChunks do Rollup](https://rollupjs.org/configuration-options/#output-manualchunks). A divisão do bundle não constitui benchmark de desempenho no app real.

Testes desta manutenção: frontend 253/253; Rust 172/172 executados, 14 casos opt-in ignorados. Evidência resumida e lista de arquivos em docs/reports/evidence/build-limpo-2026-10-24.json. A próxima execução manual usa o mesmo comando e perfil descritos abaixo.

### Detector local de rostos — 2026-10-24

YuNet 2023mar (232.589 bytes, MIT) está em `app/src-tauri/resources/models/` e é incorporado ao backend. O worker próprio usa Python/OpenCV headless em `.tooling/venvs/face-framing`, separado do ASR, com requisitos fixados em `tools/face-framing/requirements.txt`. Esse ambiente foi instalado nesta tarefa; não é necessário reinstalá-lo para testar. Não há serviço, porta HTTP, modelo multimodal, envio de mídia ou download durante a geração.

Para preparar outro checkout, crie o venv dentro do workspace com o Python disponível e instale somente o requirements desse componente. Em debug, a descoberta usa esse venv; `CNP_FACE_PYTHON` permite indicar um Python já preparado. Para release, o caminho previsto é `cutnicepro/engine/face-framing/python.exe` no app-data (ou `bin/python` em Unix): o instalador desse componente ainda não é entregue por esta tarefa. Ausência/falha é registrada como unavailable, preservando geração textual e enquadramento escolhido, sem tentar instalar silenciosamente.

O módulo processa apenas novos cortes 9:16 em cover, até 12 pares de imagens por corte, CPU/uma thread, sem paralelismo com o LLM. O worker tem orçamento interno de 120 s e timeouts de abertura/leitura de 5 s; cancelamento usa ProcessControl existente. Centro seguro é convertido para a âncora de crop consumida pela prévia/editor/export; ambiguidade recomenda contain; edição salva prevalece. Não confundir isso com trilha de câmera animada. Exibição de evidência técnica permanece distinta da análise textual.

No Windows, o executável do venv é um launcher que pode criar outro PID. A integração resolve o Python real pelo home do pyvenv.cfg e acrescenta somente os pacotes do venv em bootstrap isolado (-I/-S). Assim ProcessControl possui diretamente o PID que executa o detector. O teste worker_pid_is_the_direct_owned_process comprovou a igualdade; não usar o WorkingSet do launcher como consumo do detector. Medida válida vem de PeakWorkingSetSize no próprio worker: 101,53 MiB nas duas janelas testadas (9,34 s de processamento). O venv ocupa 167,90 MiB no disco; nenhum target adicional foi criado.

Teste de matemática/segurança sem inferência: `.tooling/venvs/face-framing/Scripts/python.exe -B tools/face-framing/test_worker.py`. Teste nativo real é separado e ignored por padrão, `autoclip_editorial_runtime_probe`, exigindo `CNP_EDITORIAL_EVIDENCE` e `CNP_EDITORIAL_SOURCE`; escreve apenas em pasta exclusiva de evidências, não semeia projetos no perfil do mantenedor.

O caminho de desenvolvimento é único: `C:\CutNicePro\app\src-tauri\target\debug\cutnicepro.exe`. Para abrir a interface e o motor juntos, use PowerShell:

```powershell
Set-Location C:\CutNicePro\app
npm run tauri dev
```

Esse comando utiliza a configuração existente: frontend em `http://localhost:1420`, identificador `com.cutnicepro.app` e perfil normal, sem `WEBVIEW2_USER_DATA_FOLDER` de laboratório. O executável de debug depende do frontend de desenvolvimento; não usar um exe histórico isoladamente como alternativa ao comando. Não definir `CARGO_TARGET_DIR` para uma pasta de tarefa.

Nesta manutenção, o código atual foi recompilado em `target` e o teste específico do contrato `wordsPerCaption` passou (1/1). O executável padrão anterior era de 2026-10-23; o novo inclui a fonte com alias compatível. Isso não equivale a um novo teste de export pela UI ou aceite editorial.

Com autorização explícita do mantenedor, foram removidos apenas os caches `target-f2c`, `target-refino` e `target-upd20`, com Cargo e caminhos absolutos previamente verificados. Somavam 21,40 GiB de tamanhos lógicos; a variação medida do espaço livre durante a limpeza foi +15,386 GiB. A build canônica permaneceu com SHA-256 `16F56F000A3253EDC069A492C9A9B8369C65981E72D0C69FCA292584AF9C1F30`. Fontes, modelos, mídias, relatórios e projetos não foram removidos. Caminhos de builds antigas nos relatórios/labs são históricos, não instruções atuais para abrir o app.

Inventário adicional, sem autorização de exclusão: `.tooling` 33,65 GiB, `experiments` 20,78 GiB, `app/node_modules` 0,27 GiB e `docs/reports` 0,48 GiB. Essas pastas misturam motores/modelos, ferramentas, fontes e evidências; não tratá-las integralmente como descartáveis. Os valores são tamanhos lógicos observados nesta tarefa, não garantia de espaço recuperável.

Após a limpeza, a primeira abertura detectou um Vite antigo ocupando a porta 1420. O servidor foi identificado pelo caminho exato do Vite deste repositório e encerrado; a tentativa de abertura desta tarefa também foi encerrada. A segunda abertura pelo comando canônico iniciou Vite e Tauri normalmente. Verificação: uma janela CutNicePro responsiva, exe no caminho padrão/hash acima e frontend HTTP 200 em localhost:1420. Nenhum processo de outro projeto foi encerrado. A sessão de desenvolvimento desta tarefa ficou aberta para o mantenedor testar.

Após a limpeza, a primeira abertura detectou um Vite antigo ocupando a porta 1420. O servidor foi identificado pelo caminho exato do Vite deste repositório e encerrado; a tentativa de abertura desta tarefa também foi encerrada. A segunda abertura pelo comando canônico iniciou Vite e Tauri normalmente. Verificação: uma janela CutNicePro responsiva, exe no caminho padrão/hash acima e frontend HTTP 200 em localhost:1420. Nenhum processo de outro projeto foi encerrado. A sessão de desenvolvimento desta tarefa ficou aberta para o mantenedor testar.

Política permanente de build único em AGENTS.md. Diagnóstico e manifesto da limpeza em `docs/reports/evidence/build-unico-2026-10-24/diagnostico.json`.

## Organização do Git e artefatos locais — 2026-10-24

Fontes React/Rust, testes, locks, ícones, posters e fontes Poppins reais devem estar versionados. O CI passa a usar esses recursos diretamente, sem executar `tools/ci/stub-assets.mjs`; o script permanece como histórico, sem chamada no workflow. A licença OFL acompanha os TTF em `app/src-tauri/resources/fonts/OFL.txt`. Versão mantida em 0.19.0, sem release ou publicação automática.

MP4s de laboratório em `docs/reports/evidence/` ficam locais e ignorados pelo Git; nenhum vídeo foi apagado ou movido. O manifesto `docs/reports/evidence/organizacao-git-2026-10-24/artefatos-locais.json` registra caminho, tamanho, motivo e SHA-256 dos 15 MP4s, dos três aplicadores de patch de uso único e de quatro resultados vazios de scratch. São 22 arquivos, aproximadamente 334,48 MiB, preservados no disco. O manifesto permite conferir identidade, mas não contém nem recupera os vídeos: um clone novo não os terá. A fixture MP4 pequena já versionada anteriormente continua no Git. Documentos de design e evidências textuais não foram ignorados em bloco.

`apply_f1.py`, `apply_g3c.py` e `app/src-tauri/apply_mm_helpers.py` são históricos locais, não comandos de manutenção. Os laboratórios em `tools/e2e/` também registram procedimentos antigos: alguns semeiam dados, encerram processos e removem arquivos. Não fazem parte das suítes automáticas nem devem ser executados indiscriminadamente no perfil do mantenedor. Para testes da interface, seguir a preferência vigente de validação manual, sem controlar a tela.

Um commit local não atualiza o Graphify remoto. A conexão desta tarefa consulta o índice promovido ab501e26634648a59e005238c2c50b3230b4cac0. Não há ferramenta de reindexação entre as operações MCP expostas; após publicação autorizada no GitHub, conferir no painel a atualização do repositório e consultar novamente `graph_stats`. Só declarar atualizado quando o commit retornado corresponder à revisão publicada. Não prometer gatilho automático nem enviar arquivos locais ao serviço. Referências oficiais: [MCP remoto](https://graphify.com/mcp) e [configuração e consultas](https://github.com/Graphify-Labs/graphify-mcp).

O ajuste de navegação em `ProjectWorkspace` conserva a entrada no editor quando a rota muda e permite voltar ao projeto com a rota inalterada. A sincronização ocorre antes de renderizar os filhos, sem `setState` síncrono em effect, conforme a [orientação do React](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes). Teste com hooks simulados cobre abrir, voltar e abrir novamente; não é prova de navegação no Tauri real.

## Estado atual da aplicação — 2026-10-19, revisão 03N

O ambiente de 2026-10-17 abaixo é histórico de instalação; a aplicação já possui código e processamento real. Stack conferida em `app/package.json`, `app/src-tauri/Cargo.toml` e fontes: React/TypeScript/Vite, Tauri v2/Rust, CSS/tokens próprios e ícones Phosphor. Zustand/GSAP/Motion/Three constam nas dependências; Vitest e Happy DOM nos testes. Tailwind, shadcn/ui, dnd-kit e Supabase não constam como dependências da aplicação atual; não presumir sua integração nem migrar a arquitetura por esta atualização documental.

| Capacidade | Local/configuração | Estado verificado no código |
|---|---|---|
| Vídeo e exportação | `media_tools.rs`, `render/`; `.tooling/vendor/ffmpeg/` | FFmpeg/ffprobe, ASS, NVENC sondado e libx264 como fallback; sem instalador dos motores |
| Reconhecimento de fala | `transcription/`; `.tooling/vendor/whisper/`; `CNP_ENGINE_HOME` opcional | whisper.cpp, Turbo padrão, Large completo ainda suportado no código; CPU/CUDA conforme descoberta; blocos/checkpoints |
| Seleção e análise textual | `clips/`; `.tooling/vendor/analysis/`; `CNP_ANALYSIS_HOME` opcional | Qwen3-4B Q4_K_M com llama.cpp b11729, Vulkan quando disponível e fallback CPU; não é Qwen3-ASR nem análise visual |
| Persistência | Rust/app-data + `workspace-store.ts`/localStorage | Mídia copiada, projetos/coleções/transcrições/clipes nativos; ajustes finos do editor no workspace local |
| Testes | `app/src/test/`, módulos Rust | Suítes de contratos/interação e casos nativos explícitos; resultados históricos em reports, sem aprovação editorial implícita |

Decisão vigente do mantenedor: manter Turbo e retirar Large completo do produto; remoção de UI/backend ainda pendente, sem apagar pesos ou transcrições nesta etapa documental. Não baixar/reinstalar ferramentas para atualizar estes documentos. Disponibilidade em outra máquina e distribuição dos pesos/binários não estão concluídas.

## Visão geral

| Recurso | Onde | Estado |
|---|---|---|
| Skills do projeto | `.zcode/skills/` | 16 arquivos SKILL.md na última baseline 03M; disponibilidade depende do agente/sessão |
| Referências compartilhadas | `.zcode/references/` | 5 checklists usados pelas skills Addy Osmani |
| MCP do workspace | `.zcode/config.json` | FigCraft e Graphify local legado; o remoto Graphify deve ser configurado no cliente. Registro não garante exposição/conexão |
| Playwright CLI | `.tooling/playwright/` | `@playwright/cli` 0.1.22 local |
| Graphify remoto (oficial) | `https://api.graphify.com/mcp` | Validado no Codex em 2026-10-24: OAuth e consultas reais em wesley-s-workspace/FrosttyS18/CutNicePro; índice em ab501e2, complemento local obrigatório |
| Graphify local (histórico) | `.tooling/venvs/graphify/` | `graphifyy` 0.9.92 + extra `[mcp]`; não é rota oficial nem fallback |
| Clones e runtimes locais | `.tooling/vendor/` | Clones históricos e motores/modelos adicionados; hashes por entrega em reports/evidence |
| Artefatos do FigCraft | `design/` | Pasta de saída para exports do MCP |

## Skills instaladas (`.zcode/skills/`)

**Design — taste-skill** (github.com/Leonxlnx/taste-skill, commit `f624f37`):
- `design-taste-frontend` — direção de arte para **páginas públicas** (não usar em dashboards/editores). Inclui `library/`, `references/`, `scripts/`, `assets/`. Scripts exigem Node 22+ (há Node 24) e Chrome/Edge instalado; arquivos de trabalho em `.taste-skill/` do projeto.
- `image-to-code` — interpretação e implementação fiel de referências visuais.
- `minimalist-ui` — interfaces internas estilo editorial minimalista (avaliada e incluída para as telas da aplicação).

**Auditoria — Vercel** (github.com/vercel-labs/agent-skills, commit `063bee9`):
- `web-design-guidelines` — auditoria verificável de UI: acessibilidade, teclado, semântica, estados, formulários, responsividade.

**Engenharia — Addy Osmani** (github.com/addyosmani/agent-skills, commit `aeac41d`) — ciclo
SPEC → PLAN → BUILD → TEST → REVIEW:
`using-agent-skills`, `spec-driven-development`, `planning-and-task-breakdown`,
`incremental-implementation`, `test-driven-development`, `frontend-ui-engineering`,
`source-driven-development`, `code-review-and-quality`, `security-and-hardening`,
`documentation-and-adrs`.

**Conhecimento — Graphify**: `graphify` (gerada pelo pacote local `graphifyy` 0.9.92).
Os procedimentos locais dessa skill são históricos e ficam subordinados à política
de Graphify remoto em AGENTS.md; não executá-los como fallback para o novo gate.

As demais skills do repositório do Addy Osmani **não** foram instaladas (orçamento de contexto);
os clones completos ficam em `.tooling/vendor/` para instalação futura se necessário.
Sem conflito de nomes com skills do usuário (`frontend-design`, `impeccable`,
`gow3-figma-fidelity`) ou de plugins.

Referências compartilhadas das skills Addy Osmani ficam em `.zcode/references/`
(`definition-of-done.md`, `accessibility-checklist.md`, `testing-patterns.md`,
`security-checklist.md`, `performance-checklist.md`) — os caminhos relativos `../../references/`
das skills continuam válidos. `security-and-hardening/references/hardening-patterns.md` foi
preservado dentro da própria skill.

## MCP do workspace (`.zcode/config.json`)

### `figcraft` — headless (VALIDADO)
- Comando: `C:\Program Files\FigCraft\figcraft-cli.exe mcp`
- figcraft-cli **0.6.0** (pré-instalado; não modificado). Handshake testado: protocolo MCP
  `2025-06-18`, 18 ferramentas: `list_commands`, `run_command`, `batch`, `create_node`,
  `set_properties`, `inspect_document`, `get_node`, `select`, `export`, `screenshot`,
  `open_file`, `save_file`, `undo`, `redo`, `pointer`, `key`, `type_text`, `inspect_ui`.
- **Limitação:** a doc atual do repositório (docs/mcp.md, cópia em `docs/references/figcraft-mcp.md`)
  documenta `--automation-read-root/--automation-write-root`, mas o binário 0.6.0 instalado
  **não aceita** essas flags ("unknown option"). Confinamento de arquivos indisponível nesta
  versão — reavaliar quando o FigCraft for atualizado.

### `figcraft-app` — modo conectado (VALIDADO 2026-10-17; carrega no próximo reinício)
Registrado no `.zcode/config.json` via wrapper auto-recuperável
`.zcode/figcraft/figcraft_app_server.py`: anexa ao app (porta 7979), abre o app com
`--control 7979` quando o marker `design/FIGCRAFT-ATTACHED.on` existe, ou cai no fallback
headless — o startup do ZCode nunca quebra. Validação real completa (handshake, 18
ferramentas, criação/modificação/leitura/captura/export em aba descartável, documento do
usuário preservado): **`docs/FIGCRAFT-ATTACHED.md`**. Ativação/desativação pelo marker.

### Graphify remoto — rota oficial (decisão do mantenedor, 2026-10-23)

- Endpoint: `https://api.graphify.com/mcp`; transporte Streamable HTTP; autenticação OAuth pelo navegador.
- Nome do servidor no cliente: `graphify`. Workspace indicado: `wesley-s-workspace`; repositório `FrosttyS18/CutNicePro`. Confirmar IDs/acesso/índice pelas ferramentas, sem trocar o alvo para obter resultados.
- **Estado atual (2026-10-24):** Graphify remoto configurado e autenticado no Codex com autorização expressa do mantenedor para a entrada em sua configuração de usuário. Nesta correção da biblioteca, list_workspaces/list_repositories confirmaram wesley-s-workspace e FrosttyS18/CutNicePro; consulta de ClipPoster resolveu símbolo exato e fonte. Impacto/testes/consumidores consultados antes da edição e impacto revisto depois. Índice: ab501e26634648a59e005238c2c50b3230b4cac0, 2026-10-23T14:52:12Z; igual ao HEAD, mas sem o working tree posterior. isClipNew não estava no índice (retorno semântico incorreto não foi tratado como definição); referências locais supriram a lacuna. O stdio local em .zcode/config.json continua legado, sem uso como fallback. Não houve upload, commit/push ou publicação automática do working tree.
- Configurar no formato da versão real do cliente e reutilizar a entrada correta; preservar MCPs não relacionados. Preferir suporte HTTP/OAuth nativo. Ponte para o mesmo serviço remoto somente se necessária e documentada; não confundir ponte de transporte com servidor de grafo local. Não pedir chave de API em texto nem persistir tokens no projeto.
- Validação mínima: ferramentas expostas -> workspace/repositório autorizados -> índice pronto -> símbolo conhecido com localização de fonte e relações. Handshake ou descoberta não comprovam acesso ao grafo.
- Antes da fatia, consultar símbolos/chamadores/dependências/impacto/testes e registrar consumidores e contratos afetados. Confirmar cobertura e resolução da fonte; resultados vazios/semânticos não provam ausência de relações.
- Conferir revisão indexada contra HEAD e alterações locais/não rastreadas. Índice remoto não é prova de cobertura do working tree. Complementar por leitura/diff local, incluindo IPC/contratos entre linguagens. Depois da mudança, revisar diff, testar e verificar relações afetadas.
- Atualizar índice somente por mecanismo suportado/autorizado; não publicar commits/push nem enviar código local automaticamente para sincronizá-lo. Registrar defasagem remanescente.
- Sem serviço/acesso/índice: registrar a etapa bloqueada e continuar somente atividades independentes. Não usar o servidor local como fallback silencioso. Regra permanente em `AGENTS.md`.
- Fontes oficiais: [MCP remoto](https://graphify.com/mcp), [setup e verificação](https://github.com/Graphify-Labs/graphify-mcp). O grafo ajuda a escolher o alcance/testes; não executa os testes nem restaura arquivos.

### Histórico — `graphify` local stdio (handshake antigo; não é rota oficial)
- Comando: `C:\CutNicePro\.tooling\venvs\graphify\Scripts\python.exe -m graphify.serve --graph C:\CutNicePro\graphify-out\graph.json`
- Handshake testado (inicia mesmo sem grafo ainda). 10 ferramentas: `query_graph`, `get_node`,
  `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`, `list_prs`,
  `get_pr_impact`, `triage_prs`.
- **Pendente:** `graphify-out/graph.json` ausente na revisão 03N, apesar de já existir código. Indexação inicial não realizada; não confundir handshake histórico com grafo atualizado ou ferramenta exposta na sessão.

## Playwright CLI

- Caminho: `C:\CutNicePro\.tooling\playwright\node_modules\.bin\playwright-cli` (`.cmd` disponível)
- Versão 0.1.22 (`@playwright/cli`). Automação completa via terminal: `open`, `goto`, `click`,
  `fill`, `snapshot`, `find`, `eval`, screenshot, video, tracing, `install-browser` etc.
  (`--help` para tudo). `playwright-cli list` testado OK.
- Navegadores: cache existente em `%LOCALAPPDATA%\ms-playwright` (chromium 1243/1248, ffmpeg) —
  reaproveitado, nada foi baixado. Se uma versão exigir browser novo:
  `playwright-cli install-browser` (artefatos ficam no cache do usuário; alternativa local:
  `PLAYWRIGHT_BROWSERS_PATH=C:\CutNicePro\.tooling\pw-browsers`).

## Histórico — Graphify CLI local (não é rota oficial)

- Executável: `C:\CutNicePro\.tooling\venvs\graphify\Scripts\graphify.exe` (NÃO está no PATH).
- venv Python 3.12 isolado em `.tooling/venvs/graphify` (criado com `python -m venv` + pip; `uv`
  não está instalado no sistema e nada global foi instalado).
- Operações de indexação disponíveis (código já existe; não executadas nesta revisão):
  - Gerar grafo inicial: `graphify build C:\CutNicePro` (via caminho completo acima)
  - Consultar: `graphify query "..."`, `path A B`, `explain X`, `affected X`, `god-nodes`
  - Atualizar após mudanças: `graphify update C:\CutNicePro`
  - Artefatos em `graphify-out/` (na raiz; respeita `.gitignore`)
- A opção `install --platform ...` do pacote foi **descartada**: as plataformas suportadas
  instalam fora do workspace ou em dirs de outros agentes. A skill foi registrada manualmente em
  `.zcode/skills/graphify/`.

## Biblioteca Design.md (Awesome)

- Clone local completo: `.tooling/vendor/awesome-design-md/design-md/` (84 marcas, commit `3b6053`).
- Curadoria pertinente ao produto: `docs/references/design-md-shortlist.md`
  (runwayml, figma, framer, linear.app, raycast, superhuman, warp, notion, miro, sanity,
  webflow, cursor).

## Graphify — papel e estado

**Distinção arquitetural (permanente):** os arquivos Markdown do projeto são a
**documentação permanente**, escrita e mantida deliberadamente (AGENTS.md = instruções
persistentes dos agentes; docs/ = documentação técnica; docs/reports/ = auditoria
historicamente necessária; logs de hooks = runtime). O **Graphify é ferramenta
complementar**: constrói um grafo de conhecimento da base de código e de suas relações
para consulta durante alterações estruturais. Ele NÃO gera os Markdown, NÃO substitui
documentação, testes ou leitura do código, e não recebe módulos artificiais para "alimentar"
o grafo.

Estado vigente: `GRAPHIFY REMOTE REQUIRED — CONNECTION / OAUTH / INDEX QUERY NOT VALIDATED HERE`.
Configuração e consulta real ficam para o cliente ZCode, conforme runbook acima.
Estado local histórico: `INSTALLED — INITIAL INDEX PENDING` na revisão 03N;
handshake antigo e ausência de `graphify-out/graph.json` não comprovam uso de grafo.
O remoto é a rota oficial; conferir fonte/diff local para lacunas do índice e respeitar
o gate de indisponibilidade de AGENTS.md, sem fallback local silencioso.

## Reinício do ZCode

Skills e MCPs (`figcraft`, `figcraft-app`, `graphify`) foram validados no ZCode em 2026-10-17
(descoberta + chamadas reais daquela sessão; ver `docs/SETUP-REPORT.md` e `docs/HOOKS.md`). Essa evidência não comprova carregamento no agente atual. Reinício do ambiente original só é
necessário para: alterações futuras em `.zcode/config.json` (skills/MCPs), para o timeout
de 90 s do Stop vigorar, ou ao ativar o `figcraft-app` pelo runbook.

## Portabilidade (avaliado em 2026-10-17, antes da publicação)

Este repositório foi montado em uma máquina Windows específica. Em outro computador,
ajustar antes de usar: `.zcode/config.json` (caminhos absolutos do `figcraft-cli.exe` e do
Python), `.zcode/figcraft/figcraft_app_server.py` (APP/CLI/ROOT), os scripts de hook
(`PROJECT_ROOT` em `common.py`) e o `harness` (`DEFAULT_ROOT`). O marker
`design/FIGCRAFT-ATTACHED.on` é local (gitignored) e inócuo se ausente — o servidor
`figcraft-app` cai no fallback headless. Conteúdos de terceiros e licenças: ver
`THIRD-PARTY-NOTICES.md` (atenção ao item 5 — pendência de licença).

## Hooks de proteção (escopo USER — autorizado em 2026-10-17)

- Configuração: `C:\Users\adcka\.zcode\cli\config.json` → `hooks` (`enabled: true`), com 4
  eventos: `SessionStart`, `PreToolUse` (`^Bash$`, guard de comandos destrutivos),
  `PostToolUse` (`^(Edit|Write|ApplyPatch)$`, validação de arquivos) e `Stop` (auditoria +
  baseline de regressões).
- Scripts, regras e baseline ficam **no repositório**: `.zcode/hooks/scripts/` e
  `.zcode/hooks/harness/baseline_checks.py`. Identificação de workspace via
  `${ZCODE_PROJECT_DIR}` — fora de `C:\CutNicePro` tudo é no-op.
- Log de auditoria: `.zcode/hooks/audit/audit-log.jsonl` (gitignored).
- Estratégia de testes em dois níveis: **fast** no Stop (checks estruturais, suítes SKIP) e
  **full** explícita (`baseline_checks.py`, padrão) antes de concluir implementações relevantes.
- Stop real validado nativamente em 2026-10-17 21:04:59 (baseline PASS 4/0/2, sem loops,
  sem bloqueios indevidos); a partir da otimização o Stop registra `mode` e `duration_s`.
- Desativação: toggle de hooks na interface do ZCode (global) ou `"hooks": {"enabled": false}`.
- Documentação completa, matriz de testes e políticas: **`docs/HOOKS.md`**.
- Eventos nativos validados em 2026-10-17 pós-reinício (SessionStart, PreToolUse BLOCK,
  PostToolUse e Stop fast — detalhes e timestamps em `docs/HOOKS.md`).
