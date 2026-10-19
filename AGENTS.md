# CutNicePro — Instruções do Projeto

Plataforma de edição inteligente de vídeos (inspirada no OpusClip).
**Status atual: interface e fluxo de projetos implementados; motor de vídeo/IA e exportação real ainda pendentes.** Ponto de continuidade: `docs/engineering/ENGINE-HANDOFF.md`. Conferir o código e as evidências atuais antes de assumir funcionalidades concluídas. Detalhes de ferramentas em `docs/TOOLING.md`.

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

## Motor de funcionamento — estrutura e prevenção de regressões

- Antes de implementar, consultar `docs/engineering/ENGINE-HANDOFF.md`, o Product Brain e o backlog; definir escopo, contratos, critérios de aceite e testes da fatia. Não instalar motores ou alterar arquitetura apenas por esta seção: respeitar a tarefa autorizada.
- Implementar em fatias pequenas de ponta a ponta, com resultado verificável. Preservar a interface aprovada e os dados existentes; não misturar integração do motor com redesenho ou refatorações não relacionadas.
- Evitar arquivos monolíticos, componentes gigantes e módulos que concentram todo o pipeline. Cada módulo deve ter uma responsabilidade clara; dividir por capacidade e motivo de mudança, sem fragmentar artificialmente nem criar abstrações sem uso concreto.
- Separar interface e hooks, regras de domínio, orquestração de jobs, persistência e adaptadores de vídeo/IA. Componentes React não executam processos, acessam credenciais ou concentram regras do pipeline; comandos Tauri devem ser pontos de entrada finos, delegando trabalho a módulos próprios.
- Manter contratos tipados nas fronteiras React/IPC/Rust e entre etapas: entradas, saídas, unidades de tempo, erros, estados e eventos. Validar dados externos em runtime; não usar `any`, casts ou defaults silenciosos para esconder incompatibilidades.
- Isolar ferramentas e provedores atrás de adaptadores específicos; manter regras de negócio independentes de SDKs e binários. Adicionar dependências somente com justificativa técnica, documentação oficial e licença verificadas; não introduzir infraestrutura distribuída sem necessidade demonstrada.
- Processamento demorado não pode bloquear a interface. Definir limites de concorrência e recursos, cancelamento e timeout; encerrar processos próprios e liberar arquivos temporários, handles e listeners em sucesso, falha e cancelamento. Não encerrar processos alheios.
- Jobs devem ter transições explícitas e recuperação definida: enfileirado, executando, concluído, falhou ou cancelado. Evitar duplicação em retry e eventos tardios após cancelamento; progresso e sucesso precisam refletir trabalho real, nunca timers simulados.
- Tratar mídia original e dados salvos como ativos do usuário: alterações não destrutivas, identificação estável, gravação segura e migrações versionadas com compatibilidade ou recuperação documentada. Não persistir object URLs como caminhos de mídia; falhas não podem apagar projetos ou produzir arquivos finais incompletos como sucesso.
- Local e BYOK devem permanecer distinguíveis. Nunca enviar mídia a provedor externo como fallback silencioso; credenciais ficam no armazenamento seguro do sistema, fora de localStorage, código, fixtures e logs. Logs devem permitir diagnóstico sem expor chaves ou conteúdo sensível.

### Testes automáticos e critérios de conclusão do motor

- Para cada alteração funcional do motor, definir testes de comportamento e executá-los antes da entrega. Reutilizar os runners existentes; testes devem ser determinísticos, independentes e usar fixtures pequenas, sem exigir rede, chave paga ou download de modelo nas suítes rápidas.
- Cobrir regras e transições com unitários; contratos IPC, persistência/migrações e adaptadores com integração pertinente; manter uma fatia ponta a ponta real para importação → transcrição → salvamento/reabertura → exportação, à medida que essas capacidades forem implementadas.
- Em correções de bugs, acrescentar teste que reproduza o comportamento defeituoso e demonstre a correção, quando automatizável. Não criar testes que apenas espelhem a implementação, dependam de detalhes internos ou passem mesmo com a regressão original.
- Incluir cenários de erro relevantes à fatia: mídia inválida/ausente, duração e timestamps, falha de processo/provedor, timeout, cancelamento, retry, persistência e recursos liberados. Usar mocks para falhas controladas; identificar claramente os testes simulados.
- Mocks de IPC, provedores e processos não comprovam integração real. Ao conectar uma capacidade, verificar também seu funcionamento no Tauri com mídia real e artefato de saída verificável. Um motor não é concluído apenas porque compila, inicia um processo ou passa em testes com mocks.
- Mudanças em contratos ou armazenamento exigem testes dos consumidores e da compatibilidade afetados. Antes de implementar, selecionar a regressão pertinente; executar os testes exigidos pelo escopo e pela política de validação. Uma nova mudança que afete um caso aprovado justifica sua reexecução; não repetir suítes sem impacto ou falha que a justifique.
- Não remover, desabilitar ou enfraquecer testes e critérios de aceite para obter PASS. Não ampliar tolerâncias sem justificativa do contrato. Registrar falhas preexistentes separadamente; falha pertinente não resolvida impede declarar PASS da capacidade afetada.
- Na entrega, registrar comandos, resultados e limites reais. Testes reduzem o risco de regressões, mas não garantem ausência total de bugs. Respeitar `docs/engineering/VALIDATION-POLICY.md`, inclusive orçamento de execução e aprovação visual humana; esta seção não autoriza validação ilimitada.

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

## CUTNICEPRO — VALIDATION OWNERSHIP & EXECUTION BUDGET (regra permanente)

- **A aprovação estética/visual é responsabilidade EXCLUSIVA do mantenedor.**
  O ZCode responde pela implementação correta e pela verificação funcional
  (compilação, testes pertinentes, runtime, regressões, erros de console,
  recursos). O ZCode NÃO inicia auditorias estéticas autônomas.
- **Subagente VISION desativado por padrão**: uso PROIBIDO salvo solicitação
  explícita do mantenedor ou autorização específica na tarefa; mesmo
  autorizado, exige objetivo delimitado e condição de parada objetiva.
- Validação proporcional ao escopo (pequena → testes relacionados;
  funcional → unitários/integração/runtime; arquitetura → baseline completa;
  exclusivamente visual → compilação + runtime sem erros + integridade
  funcional; estética fica para o mantenedor).
- Orçamento de execução: planejar testes antes; critério PASS/FAIL objetivo;
  UMA rodada inicial + no máximo UMA repetição justificada; não repetir
  aprovados; não investigar para "melhorar evidência"; bloqueio externo →
  BLOCKED; limite sem conclusão → PARTIAL. Exceções exigem autorização.
- Critérios obrigatórios nos relatórios: FUNCTIONAL STATUS (PASS/FAIL/
  PARTIAL/BLOCKED), REGRESSION STATUS (PASS/FAIL/NOT TESTED), VISUAL STATUS
  (PENDING HUMAN APPROVAL). PASS funcional ≠ aprovação estética; não declarar
  regressões/vazamentos além do escopo efetivamente testado.
- Eficiência: priorizar verificação direta de estado/contratos e testes
  determinísticos; screenshots NÃO são evidência principal quando o estado é
  verificável diretamente; limpar WebView2 órfãos de portas de debug;
  instrumentação temporária é removida ao final; funcionalidade comprovada →
  ENCERRAR validação.
- Regras completas (responsabilidades, tabela de escopos, limites, relatos):
  **docs/engineering/VALIDATION-POLICY.md** (APROVADO 2026-10-18).

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

- A aprovação estética/visual pertence ao mantenedor (ver
  `CUTNICEPRO — VALIDATION OWNERSHIP & EXECUTION BUDGET` e
  `docs/engineering/VALIDATION-POLICY.md`).
- Em tarefas de interface, o ZCode valida o FUNCIONAMENTO (runtime sem erros,
  interações solicitadas, integridade dos componentes); capturas com o
  Playwright CLI (`.tooling/playwright/node_modules/.bin/playwright-cli`)
  apenas quando a verificação direta de estado não for possível.
- Não afirmar fidelidade visual além do escopo testado; o status visual é
  sempre `PENDING HUMAN APPROVAL`.

## Regra permanente de governança de artefatos (Fase 02A.5)

- Toda nova versão de UX deve ter identificação clara (nome, versão e estado); versões antigas nunca podem permanecer visualmente indistinguíveis das atuais.
- Revisão técnica (Quality Gate PASS) NÃO substitui aprovação do mantenedor; apenas artefatos explicitamente APPROVED são especificação visual definitiva para implementação.
- Artefatos reprovados permanecem identificados como históricos (REJECTED/ARCHIVED); o Product Brain (`docs/product/PRODUCT-BRAIN.md` §10) registra o estado oficial de cada artefato — consultá-lo antes de derivar trabalho visual.
- Wireframes futuros devem apontar para jornadas/fluxos APPROVED; não renomear automaticamente propostas como versões definitivas; não manter várias versões oficiais simultâneas para o mesmo propósito.

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
