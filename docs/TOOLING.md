# CutNicePro — Tooling

Ambiente preparado em 2026-10-17. **Tudo restrito ao workspace `C:\CutNicePro`.** Nenhuma
instalação global foi feita (sem `npm -g`, sem `uv tool`, sem alteração de PATH/config globais).

## Visão geral

| Recurso | Onde | Estado |
|---|---|---|
| Skills do projeto (15) | `.zcode/skills/` | Instaladas; carregam após reiniciar o ZCode |
| Referências compartilhadas | `.zcode/references/` | 5 checklists usados pelas skills Addy Osmani |
| MCP do workspace | `.zcode/config.json` | `figcraft` + `graphify` (auto-conectam ao iniciar sessão) |
| Playwright CLI | `.tooling/playwright/` | `@playwright/cli` 0.1.22 local |
| Graphify (venv) | `.tooling/venvs/graphify/` | `graphifyy` 0.9.92 + extra `[mcp]` |
| Clones de referência | `.tooling/vendor/` | 4 repositórios (hashes abaixo) |
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

### `figcraft-app` — modo conectado (PENDENTE, não registrado)
Testado: sem o app rodando, o servidor falha na inicialização
("can't reach the FigCraft app at 127.0.0.1:7979"), o que quebraria toda sessão. Para ativar:
1. Iniciar o app: `figcraft --control 7979`
2. Adicionar ao `mcp.servers` do `.zcode/config.json`:
   ```json
   "figcraft-app": {
     "command": "C:\\Program Files\\FigCraft\\figcraft-cli.exe",
     "args": ["mcp", "--attach", "7979"]
   }
   ```
   (no app é possível passar os roots de confinamento ao iniciá-lo com
   `--automation-read-root`/`--automation-write-root`, se a versão do app suportar).

### `graphify` — stdio (VALIDADO como servidor; consultas dependem do grafo)
- Comando: `C:\CutNicePro\.tooling\venvs\graphify\Scripts\python.exe -m graphify.serve --graph C:\CutNicePro\graphify-out\graph.json`
- Handshake testado (inicia mesmo sem grafo ainda). 10 ferramentas: `query_graph`, `get_node`,
  `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`, `list_prs`,
  `get_pr_impact`, `triage_prs`.
- **Pendente:** o grafo (`graphify-out/graph.json`) ainda não existe — não há base de código.
  Gerar com o primeiro build (abaixo); até lá, consultas retornam erro esperado.

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
- Uso futuro (quando houver código):
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

## Reinício do ZCode

Skills e MCPs do workspace só são carregados após reiniciar o ZCode nesta workspace. Depois do
reinício: conferir em Settings → MCP os servidores `figcraft` e `graphify`, e `/skills` para as
15 skills.

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
- Ativação real dos eventos: PENDING RESTART (hooks de configuração carregam no início da sessão).
