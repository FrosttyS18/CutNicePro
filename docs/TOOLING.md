# CutNicePro — Tooling

Ambiente inicialmente preparado em 2026-10-17. **Naquele setup, isolamento no projeto com uma exceção autorizada: os
hooks de proteção rodam no escopo USER do ZCode** (`~/.zcode/cli/config.json`, autorização
expressa de 2026-10-17) e invocam scripts versionados neste repositório; fora do workspace
`C:\CutNicePro` eles são no-op e podem ser desativados pelo toggle de hooks. Fora isso,
o setup original não fez instalação global de npm/uv nem alteração de PATH/config globais. Posteriormente, ENGINE-DECISIONS.md §1 registrou instalação autorizada de FFmpeg via WinGet fora do workspace; esse é histórico específico, não autorização geral para novas instalações. A revisão documental 03N não instala ou modifica ferramentas.

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
| MCP do workspace | `.zcode/config.json` | Configuração local de FigCraft/Graphify; registro não garante exposição/conexão no agente atual |
| Playwright CLI | `.tooling/playwright/` | `@playwright/cli` 0.1.22 local |
| Graphify (venv) | `.tooling/venvs/graphify/` | `graphifyy` 0.9.92 + extra `[mcp]` |
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

**Conhecimento — Graphify**: `graphify` (gerada pelo pacote `graphifyy` 0.9.92, com nota de
instalação local adicionada).

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

### `graphify` — stdio (VALIDADO como servidor; consultas dependem do grafo)
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

## Graphify (CLI)

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

Estado atual: `GRAPHIFY: INSTALLED — INITIAL INDEX PENDING`
(instalação/handshake documentados historicamente; `graphify-out/graph.json` ainda ausente na revisão 03N. Há código-fonte em `app/src/` e `app/src-tauri/src/`; o índice inicial e sua atualização permanecem pendentes. Ler o código atual quando o grafo estiver indisponível ou defasado.)

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
