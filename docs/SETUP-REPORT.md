# ZCODE — PROJECT SETUP REPORT (2026-10-17)

```text
╔════════════════════════════════════════════╗
║       ZCODE — PROJECT SETUP REPORT         ║
╚════════════════════════════════════════════╝

TASK
  Name: Project Environment Preparation
  Status: PARTIAL
  (tudo que podia ser instalado/validado antes do reinício foi concluído e verificado;
   itens pendentes são pós-reinício ou dependem de versão/dados futuros — detalhes abaixo)

WORKSPACE
  Root: C:\CutNicePro
  Scope: PROJECT ONLY
  Global configuration modified: NO

SKILLS
  Taste Skill: PASS — 'design-taste-frontend' (dir taste-skill, commit f624f37, com
    library/references/scripts/assets) em .zcode/skills/design-taste-frontend
  Image to Code: PASS — 'image-to-code' em .zcode/skills/image-to-code
  Web Design Guidelines: PASS — 'web-design-guidelines' (vercel-labs/agent-skills, 063bee9)
  Awesome Design: PASS — clone local .tooling/vendor/awesome-design-md (3b60532, 84 entradas)
    + curadoria em docs/references/design-md-shortlist.md (não importado indiscriminadamente;
    DESIGN.md definitivo adiado a pedido)
  Addy Osmani Agent Skills: PASS — 10 skills do ciclo SPEC→PLAN→BUILD→TEST→REVIEW instaladas;
    referências compartilhadas preservadas em .zcode/references/ (5 checklists) e
    references/hardening-patterns.md dentro de security-and-hardening; demais skills do repo
    NÃO instaladas (orçamento de contexto)
  ZCode recognition: PENDING RESTART — 15 SKILL.md com frontmatter válido, sem conflito de
    nomes com skills do usuário ou plugins; detecção real ocorre após reiniciar

TOOLS
  Playwright CLI: PASS — @playwright/cli 0.1.22 em .tooling/playwright (npm local);
    'playwright-cli list' e '--help' executados OK; navegadores reaproveitados do cache
    %LOCALAPPDATA%\ms-playwright (nada baixado)
  Global installation detected: NO — nenhum Playwright global (npm -g: apenas @openai/codex,
    @tauri-apps/cli — não modificados)
  Project-local availability: PASS
  Graphify: PASS — graphifyy 0.9.92 + extra [mcp] em venv .tooling/venvs/graphify;
    graphify --version OK; instalação 'install --platform' descartada (escreve fora do
    workspace); skill registrada manualmente com nota de caminho local
  Graphify knowledge graph: PENDING — grafo ainda não existe (não há base de código;
    gerar com o primeiro 'graphify build' quando o código começar a existir)
  Graphify MCP: PASS (servidor) / PENDING (dados) — stdio validado por handshake
    (10 ferramentas); consultas retornam erro esperado até haver graphify-out/graph.json

FIGCRAFT
  Desktop application detected: PASS — C:\Program Files\FigCraft (figcraft.exe) +
    %APPDATA%\FigCraft (pré-instalados, não modificados)
  CLI detected: PASS — C:\Program Files\FigCraft\figcraft-cli.exe, versão 0.6.0
  Workspace MCP configured: PASS — .zcode/config.json (mcp.servers) com servidor 'figcraft'
    headless; 'figcraft-app' (--attach 7979) NÃO registrado: sem o app rodando o servidor
    falha na inicialização (testado); snippet pronto em docs/TOOLING.md
  MCP connection: PASS — handshake stdio manual com initialize + tools/list (exit 0)
  Available tools: 18 — list_commands, run_command, batch, create_node, set_properties,
    inspect_document, get_node, select, export, screenshot, open_file, save_file, undo, redo,
    pointer, key, type_text, inspect_ui
  Limitação: flags --automation-read-root/--automation-write-root da documentação atual
    (docs/references/figcraft-mcp.md) NÃO existem no binário 0.6.0 instalado ("unknown
    option") — confinamento de arquivos indisponível nesta versão (doc à frente do binário)

PROJECT FILES
  AGENTS.md: PASS — regras de escopo, engenharia, design/UX, validação visual e documentação
  PRODUCT-BRIEF.md: PASS — apenas visão do produto (docs/PRODUCT-BRIEF.md)
  TOOLING.md: PASS — ferramentas, caminhos, uso e limitações (docs/TOOLING.md)
  SETUP-REPORT.md: PASS — este arquivo

VALIDATION
  Skills valid: PASS — 15/15 com frontmatter 'name' íntegro; refs internas preservadas
    (hardening-patterns.md, library/references da taste)
  MCP config valid: PASS — .zcode/config.json é JSON válido; ambos os comandos testados
    via handshake MCP real (não apenas arquivos copiados)
  Tools executable: PASS — figcraft-cli 0.6.0, playwright-cli 0.1.22, graphify 0.9.92
  Isolation verified: PASS — nenhuma escrita fora de C:\CutNicePro; sem npm -g, sem
    alteração de PATH/config globais, sem MCP global, uv ausente (nada instalado no lugar)
  Errors: nenhuma pendente de correção. Falhas intermediárias resolvidas:
    (1) flags de confinamento do figcraft-cli não suportadas na 0.6.0 → registrado como
    limitação; (2) graphify MCP exigia extra 'graphifyy[mcp]' → instalado e revalidado;
    (3) modo --attach sem o app → não registrado, snippet documentado
  Pending items: PENDING RESTART (skills/MCPs carregarem); graphify build (quando houver
    código); figcraft-app (quando o app rodar com --control); confinamento de arquivos do
    FigCraft (quando versão futura do CLI suportar)

INSTALLATION LOG
  Packages:
    - @playwright/cli 0.1.22 (npm, local em .tooling/playwright/node_modules)
    - graphifyy 0.9.92 + graphifyy[mcp] (PyPI, venv .tooling/venvs/graphify)
  Versions / revisions:
    - taste-skill f624f37a8c650b9cc550253104925efe4c8de246 (main)
    - vercel-labs/agent-skills 063bee94c3f4df8453406c830b0a7df0f2860278
    - VoltAgent/awesome-design-md 3b605329240ce735b510037cca322f1831fdd7f8
    - addyosmani/agent-skills aeac41d4d005999432bb7312f7ff06383a91d59d
    - figcraft-cli 0.6.0 (pré-instalado; somente consultado)
  Sources: github.com/{Leonxlnx/taste-skill, vercel-labs/agent-skills, VoltAgent/
    awesome-design-md, addyosmani/agent-skills}; pypi.org/project/graphifyy;
    registry.npmjs.org/@playwright/cli; raw.githubusercontent.com (docs/mcp.md do FigCraft)
  Installation paths: C:\CutNicePro\.tooling\{vendor,playwright,venvs,docs-refs};
    C:\CutNicePro\.zcode\{skills,references,config.json}; C:\CutNicePro\{AGENTS.md,design,docs}
  Toolchain do sistema (não modificada): Node 24.12.0, npm 11.6.2, Python 3.12.10,
    pip 25.3, Git 2.49.0.windows.1

FINAL
  Project environment: PREPARED (15 skills, 2 MCPs validados, Playwright CLI, Graphify,
    FigCraft integrado, docs e instruções)
  Remaining blockers: nenhum bloqueante. Pendências pós-reinício listadas acima.
  Restart required: YES

USER ACTION
  REINICIAR O ZCODE ANTES DE CONTINUAR.

NEXT STEP
  Aguardar autorização do usuário.
  NÃO INICIAR O DESENVOLVIMENTO.
```

## ADENDO — HOOKS (2026-10-17, autorização expressa do usuário)

- **Status: PASS (scripts e config) / PENDING RESTART (eventos reais).**
- 4 hooks nativos no escopo USER (`~/.zcode/cli/config.json`, `hooks.enabled: true`),
  invocando scripts versionados no projeto (`.zcode/hooks/`):
  `SessionStart` (auditoria), `PreToolUse ^Bash$` (bloqueio de destrutivos, exit 2),
  `PostToolUse ^(Edit|Write|ApplyPatch)$` (validação JSON/py/js/SKILL.md),
  `Stop` (baseline de regressões, nunca bloqueia).
- Identificação de workspace via `${ZCODE_PROJECT_DIR}`: fora de `C:\CutNicePro`, no-op.
- Testes com payloads simulados: guard 8/8 (inclui ausência de falso positivo e fail-open),
  validação 5/5, session 2/2, baseline 4 PASS/2 SKIP; evidências no `audit-log.jsonl`.
- Config USER existente preservado integralmente (plugins, 4 MCPs, overrides de skills);
  JSON validado após o merge.
- Sem loops: apenas PreToolUse bloqueia; Stop sempre exit 0; timeouts configurados.
- Desativação: toggle de hooks do ZCode ou `hooks.enabled=false` (ver `docs/HOOKS.md`).
- **Reinício do ZCode necessário para ativar os eventos reais.**
