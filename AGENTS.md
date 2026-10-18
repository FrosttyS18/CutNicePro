# CutNicePro — Instruções do Projeto

Plataforma de edição inteligente de vídeos (inspirada no OpusClip).
**Status atual: ambiente preparado, aplicação NÃO implementada.** Detalhes de ferramentas em `docs/TOOLING.md`.

## Escopo e comunicação

- Respeitar estritamente a tarefa solicitada; não implementar funcionalidades extras sem autorização.
- Não modificar arquivos fora de `C:\CutNicePro`.
- Não realizar refatorações não relacionadas; não substituir bibliotecas funcionais sem justificativa.
- Reportar limitações reais em vez de inventar soluções. Registrar `FAIL`/`BLOCKED` quando algo não puder ser validado.
- Não exigir comandos manuais do usuário quando for possível executar e validar a tarefa diretamente.

## Engenharia

- Planejar antes de implementar. Fluxo padrão: **SPEC → PLAN → BUILD → TEST → REVIEW** (skills correspondentes em `.zcode/skills/`).
- Fundamentar decisões técnicas em documentação confiável.
- Preferir soluções simples, modulares e testáveis; separar processamento de vídeo, regras de negócio e interface.
- Preferir open-source e processamento local quando tecnicamente adequado; evitar serviços comerciais desnecessários.
- Criar testes relevantes e verificar os resultados. Nenhum recurso é "concluído" apenas porque o código foi gerado: exigir funcionamento real, testes e critérios de aceite demonstrados.
- Não realizar commits, pushes, merges ou deploys sem autorização explícita.
- Não confundir um processo iniciado com um serviço realmente funcional.

## Design e UX

- Consultar o design system aprovado antes de criar componentes. A identidade visual definitiva depende de aprovação do usuário; não escolhê-la unilateralmente.
- Utilizar o FigCraft (MCP `figcraft`) nas tarefas em que houver artefatos de design. Workflow: **Briefing → FigCraft → revisão visual → componentes e design tokens → implementação frontend → screenshots → comparação com a referência → correções.**
- Priorizar interfaces profissionais de ferramentas criativas: densidade funcional equilibrada, hierarquia visual planejada, legibilidade e consistência.
- Evitar gradientes gratuitos, excesso de glassmorphism, cartões repetitivos, efeitos decorativos e componentes genéricos sem função.
- Garantir estados de hover, foco, loading, erro, sucesso, vazio e desabilitado.
- Respeitar navegação por teclado e acessibilidade; auditar interfaces com a skill `web-design-guidelines` (resultado verificável, não aprovação subjetiva).
- A skill `design-taste-frontend` é para **páginas públicas** (landing/marketing); não aplicá-la a dashboards ou editores complexos quando conflitar com usabilidade. Para interfaces internas da aplicação, avaliar `minimalist-ui`.
- Referências de design são material de estudo (`docs/references/design-md-shortlist.md`); não copiar a identidade de marcas existentes.

## Hooks de proteção

- Hooks no escopo USER do ZCode invocam scripts versionados em `.zcode/hooks/` e só atuam neste workspace (fora dele são no-op).
- Comandos Bash destrutivos (`rm -rf`, `git reset --hard`, `push --force`, `del /s`, etc.) são **bloqueados** pelo hook `PreToolUse`: usar comandos mais restritos; se a operação for realmente necessária, pedir ao usuário.
- Arquivos gravados por Write/Edit são validados (JSON/Python/JS/SKILL.md); falhas chegam como feedback e ficam no log de auditoria (`.zcode/hooks/audit/audit-log.jsonl`).
- A cada Stop, a baseline `.zcode/hooks/harness/baseline_checks.py` roda e é registrada no log (nunca bloqueia). Detalhes: `docs/HOOKS.md`.

## PROTOCOLO OBRIGATÓRIO DE ENTREGA E AUDITORIA

- Toda tarefa termina com um relatório final no formato `CUTNICEPRO — ZCODE REPORT`, sem exceção — inclusive em PASS, PARTIAL, FAIL ou BLOCKED, e mesmo sem solicitação explícita do usuário.
- Regras completas, formato obrigatório e regras de preenchimento: `docs/REPORTING-STANDARD.md`.
- Persistência: relatório integral em `docs/reports/LATEST.txt` e em `docs/reports/history/` (um arquivo por tarefa, sem sobrescrever histórico).
- Apresentação no chat: um único bloco de código `text` com o relatório integral, idêntico ao arquivo persistido.
- Somente fatos verificáveis, contagens reais e evidências reais; falhas e pendências nunca são omitidas; teste simulado não é evento real; exit 0 do hook Stop não é prova de PASS.
- A tarefa só é considerada concluída após gravar, verificar (reler) e apresentar o relatório.

## GIT COMMIT CONVENTION (regra permanente)

- Mensagens em **português brasileiro**, no formato Conventional Commits: `tipo(escopo): descrição objetiva`.
- Tipos permitidos: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `chore`, `build`, `ci`.
- Descrições curtas, claras e específicas; escopo sempre que identificável; usar o corpo da mensagem para decisões arquiteturais, riscos ou limitações.
- Proibido: mensagens genéricas (`update`, `changes`, `final`), títulos só com hashes/timestamps, misturar alterações sem relação em um commit, commits desnecessários por pequena edição.
- Priorizar commits coesos de entregas verificadas (validações executadas antes do commit).
- Não usar `--amend`, rebase ou qualquer reescrita de histórico sem autorização explícita; sem tags/releases automáticas; commits/pushes/merges somente com autorização específica.
- Histórico anterior à adoção desta convenção é preservado como está.

## PRODUCT DESIGN GATE (regra permanente)

1. Nenhuma tela nova sem vínculo a uma jornada (JRN) e a um requisito (FR/NFR) em `docs/product/`.
2. Nenhuma funcionalidade implementada sem regra de negócio (BR) e critério de aceite (AC) aplicáveis.
3. O backlog (`docs/product/BACKLOG.md`) governa dependências e prioridades aprovadas.
4. Consultar o Product Brain (`docs/product/PRODUCT-BRAIN.md`) antes de decisões estruturais.
5. Decisões relevantes atualizam os documentos canônicos afetados e suas referências no Brain (atualização incremental, sem reescrever tudo).
6. Fases de UX e produto exigem aprovação do mantenedor antes do design visual definitivo.
7. As propostas da Fase 01 são exploração histórica, não especificação final.
8. Mudanças de requisito registram impacto sobre jornadas, telas, componentes e testes (rastreabilidade em `docs/product/TRACEABILITY.md`).
9. Nunca fabricar evidências de pesquisa ou métricas para o case de portfólio (`docs/portfolio/CASE-STUDY-LOG.md`).

## Validação visual

- Em tarefas de interface: executar a aplicação, capturar evidências com o Playwright CLI (`.tooling/playwright/node_modules/.bin/playwright-cli`) quando aplicável, e comparar o resultado com a referência aprovada.
- Não encerrar tarefas visuais afirmando fidelidade sem realmente inspecionar o resultado.

## Regra permanente de validação FigCraft (Fase 02A.4)

- Toda criação ou modificação visual no FigCraft deve verificar, incrementalmente: geometria, layout, hierarquia de camadas, **z-order**, conteúdo visível, tipografia, identidade visual e integridade de componentes/instâncias quando aplicável.
- O FigCraft 0.6.0 empilha por ordem de inserção (`node.create` entra NO TOPO; `children` no dump = fundo→topo; `node.reorder {id, index}` reordena, 0 = fundo). Contrato dos fluxos: **formas < conectores < textos** — criar nessa ordem; ao recriar formas com textos existentes, mover para baixo imediatamente.
- Nunca criar grandes lotes de objetos sem inspecionar os recém-criados (get_node + screenshot). Sucesso do MCP não é PASS visual.
- PASS visual exige: verificação estrutural (ordem real das camadas, bounds, fills) + screenshot inspecionado; o gate `tools/flow/flow_gate_v2.py` inclui a dimensão Z (texto encoberto por forma opaca; rótulo atravessado por traço) — sem Z-PASS não há Visual PASS.

## Memória e documentação

- Manter decisões importantes registradas no projeto (`docs/`, ADRs).
- Consultar o Graphify antes de alterações estruturais relevantes e atualizá-lo após modificações significativas; um grafo desatualizado nunca é tratado como verdade absoluta.
- **Documentação Markdown ≠ Graphify:** os `.md` são a documentação permanente do projeto (escritos e mantidos deliberadamente); o Graphify é ferramenta complementar de análise que constrói um grafo da base de código — não gera os Markdown e não os substitui (detalhes e estado atual em `docs/TOOLING.md`).
- A documentação complementa, mas não substitui a verificação do código-fonte atual.
- Não reescrever documentação inteira sem necessidade; não confiar cegamente em resumos antigos quando for possível consultar a implementação atual.
