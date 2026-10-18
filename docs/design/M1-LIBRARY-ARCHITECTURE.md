# Home UX Redesign — Project Library Architecture (Fase M1-LIB, 2026-10-18)

> Resposta à reprovação da Home Studio Console. Esta é uma fase de
> ARQUITETURA: diagnóstico de componentes, requisitos de biblioteca
> escalável (0/1/10/50/200+), fluxo lógico reconciliado, wireframes de
> baixa fidelidade (área de planejamento do FigCraft, sem novos mestres) e
> direção visual fundamentada. NENHUMA UI final, nenhum componente
> criado/apagado, nenhum código tocado. Aprovação: PENDING.

## 1. Auditoria real de reaproveitamento de componentes

Inventário (component.list, documento atual):

| Família | Mestres/sets | Instâncias | Origem |
|---|---|---|---|
| Button | set 957 (Primary 946 / Ghost 947) | 4+1 | M1DR-1 |
| IconButton | 948 | 0 | M1DR-1 |
| TextInput | set 970 (Default 958 / Error 959) | 1 | M1DR-1 |
| ProjectCard antigo | set 981 (Default 971 / AddNew 972) | 5+1 | M1DR-1 (reprovado) |
| StatusFeedback | set 994 (Error 982 / Info 983) | 0 | M1DR-1 |
| EmptyState antigo | 995 | 1 | M1DR-1 (reprovado) |
| LoadingState | 996 | 0 | M1DR-1 |
| TopBar antigo | 1007 | 5 | M1DR-1 (reprovado) |
| **TopBar SC** | **1145** | **2** | **SC-resume** |
| **ProjectCard SC** | **set 1163 (Default 1150 / Hover 1151)** | **9+1** | **SC-resume** |

**Por que famílias duplicadas existem (diagnóstico honesto):** na retomada
controlada, criei TopBar/SC e ProjectCard/SC como famílias NOVAS em vez de
refinar 1007/981 in-place. Motivos: (a) preservar o registro visual da
composição reprovada (instâncias antigas dependem dos mestres antigos);
(b) pressa de execução — adicionar variantes/propriedades aos mestres
antigos exigiria migrar instâncias. **Isso violou a própria direção
"REFINAR os existentes" e duplicou capacidade sem justificativa de
reaproveitamento** — exatamente o apontado pela auditoria. Reconhecido.

**Comparação objetiva (mestres antigos × SC):**

| Aspecto | TopBar 1007 | TopBar SC 1145 | Δ funcional |
|---|---|---|---|
| Estrutura | logo + spacer + 2 chips | logo apenas | idem (chips = conteúdo, não componente) |
| Auto layout | horizontal, padding 32 | horizontal, padding 64 | propriedade |
| Fill | #000 + stroke inferior #1F1F1F | #0A0A0A, sem stroke | propriedade |
| Slots/props | nenhum | nenhum | — |

| Aspecto | ProjectCard 981 | ProjectCard SC 1163 | Δ funcional |
|---|---|---|---|
| Variantes | Default / AddNew | Default / Hover | AddNew será descartado do design futuro (decisão M1); Hover é estado, não variante de conteúdo |
| Dimensões | 432×152 | 421×168 | propriedade |
| Borda | stroke #2A2A2C | sem stroke (tom) | propriedade |
| Conteúdo | nome + 2 metas + pill "Abrir" | nome + 2 metas + "Abrir →" | texto/estrutura ≈ idem |
| Preview/miniatura | ausente | ausente | AUSÊNCIA comum — causa raiz da reprovação |

**Conclusão da auditoria:** as duas famílias SC são ~90% reconciliáveis
com as antigas via propriedades/variantes. Nenhum recurso novo justificava
família separada.

**Candidatos à consolidação (plano, executar apenas com autorização):**
1. **TopBar → UM mestre** "TopBar" (1007 ou 1145 como base) com
   propriedades booleanas `showRightSlot` + frame slot à direita;
   instâncias antigas migram para o mestre consolidado; fill/stroke/padding
   por instância ou variante ("Chrome/SC" × "Base"). 
2. **ProjectCard → UM set** "ProjectCard" com propriedades de variante
   `Density=Comfortable/Compact` e `State=Default/Hover/Selected` +
   propriedade booleana `showPreview` com slot de 16:9; AddNew NÃO vira
   variante (ação de criação sai do grid — decisão M1-LIB §4).
3. **Button**: manter set 957; ADICIONAR variante `Quiet` (texto puro,
   transparente) para "Abrir →" — elimina o text-layer solto dentro do
   card SC; IconButton 948 recebe propriedade de glifo/ícone.
4. **EmptyState antigo 995**: não consolidar — composição do empty state
   volta a ser EDITORIAL (por tela), não componente fixo (a direção nova
   usa composição tipográfica; caixa tracejada já descartada).

**Regra daqui em diante (registrada):** nenhuma nova família de
componente sem que propriedades, variantes, slots ou overrides tenham
sido avaliados e documentados como insuficientes.

## 2. Diagnóstico do Studio Console (PRESERVAR / REAVALIAR / NÃO REPLICAR)

**PRESERVAR:** tokens oficiais (#000/#231F20/#02C2BE/#E6E7E8 + apoio
#9BA0A4 validado AA 6,18–7,96:1); padrão "ação primária única + ghost";
contraste AA 10/10; auto layout e padding consistentes; mecânica
mestre/set/instância/variant-swap/overrides (comprovada); z-order
formas<textos; vocabulário de UX writing (matrix CM); estrutura
TopBar-conteúdo; disciplina "zero ruído interno"; frase-conceito
"console de estúdio" como INTENÇÃO (não como layout executado).

**REAVALIAR:** grid 3 colunas fixas (cards 421px = baixa densidade);
dimensão do card (168px para 3 linhas de informação — gigante);
navegação da biblioteca (inexistente: sem busca/ordenação/visualizações);
distribuição do espaço (cabeçalho fraco, sem estratégia de ferramenta);
hierarquia tipográfica (título 28 é tímido para "ferramenta de edição");
representação do projeto (só texto — sem preview, sem identidade de
mídia); densidade (6 cards + corte simulado = teatral, não escalável).

**NÃO REPLICAR:** cards grandes sem preview; botões/pills aqua
repetidos por card; chips de fase/versão/protótipo na interface;
metadados fictícios ("· N cortes"); card cortado no fim do frame para
"simular" rolagem (teatro de scroll — a nova direção especifica
comportamento real de rolagem/navegação por amostras representativas);
famílias duplicadas de componentes (ver §1); retângulos vazios como
placeholders de função.

## 3. Fluxo lógico de Home e projetos (reconciliado com as decisões MVP)

Decisões aplicadas: D1 (Home antes da config de IA — APPROVED), DEC-011
(convite beta simples — forma técnica PENDING), BR-049 (offline técnico
ok; comercial PENDING), DEC-010 (assinatura sem créditos; R$ 29,90
hipótese), DEC-012 (IA Local/BYOK contextual), DEC-013 (fila sequencial).

```
1. Primeira abertura ──► [convite beta? ◇DEC-011-forma-técnica]
        │                        │ sim                    │ não
        ▼                        ▼                        ▼
2. Verificação de ambiente   acesso concedido        (M1 atual: direto)
        │ ok                                              │
        ▼                                                 ▼
3. HOME (D1: SEM configuração prévia de IA)  ◄──── recorrente: abre direto
        │
        ├─ 0 projetos ──► estado vazio editorial ──► [Novo projeto]
        ├─ N projetos ──► BIBLIOTECA (busca/ordenação/grid-lista)
        │                      ├─ abrir projeto ──► WORKSPACE
        │                      │                      └─ ← voltar à biblioteca
        │                      └─ busca sem resultado ──► estado "nenhum resultado"
        └─ falha de leitura ──► erro causa+ação (CM-040..042)
4. [Novo projeto] ──► diálogo (nome) ──► workspace vazio ──► biblioteca (1º item)
5. Continuidade: reabrir app ──► HOME restaura biblioteca ──► último estado do projeto (FR-004)
6. Configuração de IA (DEC-012): solicitada CONTEXTUALMENTE ao iniciar
   função que exigir (importar/processar) — NUNCA como gate da Home.
```

**Subfluxos ainda não finalizados (registrar, não desenhar):** convite
beta (forma técnica DEC-011 ◇); verificação de ambiente na 1ª execução
(AC-001..003 — M2+); item indisponível com diagnóstico (AC-008/BR-032 —
depende de mídia); fluxo de compra externo (JRN-012, DEC-010 detalhes);
política offline comercial (BR-049 ◇). **Nenhuma funcionalidade comercial
inventada.**

## 4. Requisitos da biblioteca escalável (0 / 1 / 10 / 50 / 200+)

**Busca (novo requisito — emenda ao escopo M1):** campo de pesquisa por
nome, local, com debounce; clareza imediata do que é pesquisado
(placeholder honesto); estado "nenhum resultado" com ação de limpar
busca; ESC limpa; ⌘/Ctrl+F foca (atalho a validar na implementação).
Persistência de filtro durante a sessão.

**Ordenação:** "Aberto recentemente" (padrão — retomada é o caso de uso
nº1 de JRN-002), "Criado recentemente", "Nome (A–Z)". Seletor compacto
(segmented/menu); persistida por sessão; indicada quando ativa.

**Visualizações:** Grid visual (padrão) e Lista compacta (alternativa
para >~30 projetos e para usuários orientados a metadados); alternador
persiste por sessão. Lista compacta = linhas de ~44–56px com
nome/criado/aberto e ação inline — não "cards menores".

**Preview/miniatura:** área de mídia 16:9 no card grid (proporção de
vídeo, enquadramento proporcional — §5); **fallback elegante M1** =
superfície tonal com monograma do projeto (inicial do nome, tipográfica,
tom de apoio) — declarado como estado inicial, NÃO como preview de vídeo;
quando M2 importar mídia, o mesmo slot recebe o frame real (o componente
nasce com `showPreview` + slot). Lista compacta: miniatura 24–32px ou
monograma. Nenhum preview de vídeo declarado como existente.

**Ações:** criar (header, primário único), abrir/continuar (card inteiro
clicável + Enter com foco; ação visual discreta); busca/ordenação/
visualização (controles de barra). Ações futuras (duplicar/excluir
FR-017/V1, menu ⋯) SÓ quando as regras existirem — no wireframe o ⋯ é
"reservado", marcado como V1.

**Escalabilidade (200+):** rolagem real do documento (não corte
simulado); virtualização de lista na implementação React (requisito
técnico para o handoff — a UI especifica: header fixo, lista rolável,
sem paginação artificial); para VALIDAÇÃO VISUAL produzem-se amostras
representativas (topo/meio/fim + busca ativa + lista compacta) e
especifica-se o comportamento do conjunto (§7 WF-3); contador absoluto
verídico ("212 projetos") sempre conferível; largura mínima de janela
960px (Tauri conf) → grid reflow 2 colunas; alvo: navegação por teclado
(Tab/Enter/setas a validar).

**Estados:** vazio (0), 1 projeto (grid não fica "solitário": 1 card +
composição equilibrada), carregando (skeleton no LUGAR dos cards, contagem
omissa), erro (banner causa+ação), sem resultados de busca (distinto do
vazio: sempre com "Limpar busca"), item indisponível (M2+, BR-032 ◇).

## 5. Direção visual refinada — "Cut Room"

**Conceito (frase do sujeito):** no CutNicePro, **a sala de corte**
(where editors review selects) se torna a Home: uma **mesa de revisão
escura** onde projetos são **cartões de mídia com moldura 16:9** dispostos
em prateleiras densas — o editor reconhece o vídeo ANTES de ler o nome,
como numa wall of selects de estúdio.

**Diferenças do Studio Console reprovado:**
| Reprovado | Cut Room |
|---|---|
| Cards só-texto 421×168 | Cards de MÍDIA: thumb 16:9 dominante + faixa de info compacta (~120px) |
| 3 colunas fixas | Grid fluido 4–5 colunas @1440 (4 × ~300px), densidade de mesa de corte |
| Título tímido 28 + contador solto | Eyebrow "PROJETOS" caps + display 40 + contador no display (estilo refs: micro-caps vs display) |
| Sem navegação | Toolbar de biblioteca: busca (⌘F) + ordenação + alternador grid/lista |
| Aqual pills por card | Aqua SÓ: 1 ação primária + foco + hover de seleção (borda/realce do card) |
| Sem identidade própria | Monogramas tipográficos de mídia (fallback 16:9) = assinatura CutNicePro |

**Composição:** canvas #000; TopBar compacta 56–64px (wordmark +
slot direito); cabeçalho editorial (eyebrow caps 11 + "Projetos" display
40 + contador integrado + CTA "Novo projeto" à direita); toolbar de
biblioteca (busca 320px com ícone, seletor de ordenação, alternador
grid/lista — controles compactos 32–36px); grid fluido de cards de mídia;
rodapé respirado. Margens 48–64px.

**Tipografia (Poppins):** display Bold 40 (título) · nome de projeto
SemiBold 14 (Bold provisório até instalar Medium/SemiBold — pendência) ·
metas Regular 12 (#9BA0A4 apoio AA) · eyebrow caps 11 tracking 0.08em ·
controles Regular 12.5. Tabular nos números do contador.

**Superfícies escuras:** canvas #000 → card #231F20 → hover #2B2728 →
selecionado com realce aqua na moldura da mídia (1.5px) — degraus de tom,
sem bordas 1px em repouso; toolbar em superfície tonal única (sem caixa);
sem sombras em repouso (somente no modal futuro).

**Aqua como identidade, não preenchimento:** botão primário "Novo
projeto"; anel de foco; realce de seleção/hover do card (borda da mídia
+ "Continuar →" no hover); wordmark "Nice". Nada além.

**Acabamento das referências (analisado):** as refs premium da marca
conseguem "caro" com preto profundo + UM acento + contraste extremo de
escala + material 3D pontual. Libraries.dev (analisado via fetch — HTML
sem CSS renderizado): copy curta e confiante, grid de cards-demo, efeitos
COMO produto (não decoração), freemium claro — **aplicável**: a
restrutura de voz do copy e a disciplina "efeito só se for o produto";
**não aplicável agora**: beams/orbs/goo (efeitos decorativos — proibidos
pela tarefa e pela marca; reavaliáveis só pós-layout com verificação de
desempenho no Windows). Ferramentas profissionais de mídia (pesquisa:
Premiere Project panel / Resolve Media Pool / guias DAM): lista+grid
alternáveis, metadados em colunas na lista, busca local por nome,
ordenação por coluna — princípios adotados em §4 sem copiar interfaces.

## 6. UX Writing da biblioteca (revisão completa)

| Elemento | Texto | Função |
|---|---|---|
| Eyebrow | PROJETOS | rotular seção (caps, sistema) |
| Display | Projetos | âncora da tela |
| Contador | {n} {projeto/projetos} (plural computado) | estado verídico |
| Placeholder busca | Buscar por nome | escopo honesto do M1 |
| Busca sem resultado | Nenhum projeto encontrado para "{q}" + **Limpar busca** | distinguir de vazio |
| Ordenação | Aberto recentemente · Criado recentemente · Nome (A–Z) | verbos de campo claros |
| Alternador | Grade · Lista | rótulos de modo |
| Estado vazio (0) | Nenhum projeto ainda / Crie um projeto para começar. Ele ficará salvo neste computador. / [Novo projeto] | CM-001..003 |
| Card (grid) | nome · Criado {absoluto} · Aberto {relativo} · hover "Continuar →" | retomada (JRN-002) |
| Card (lista) | nome · Criado {absoluto} · Aberto {relativo} | metadados em colunas |
| Item único | 1 projeto — a biblioteca cresce com você (a validar com mantenedor) | evitar solidão do grid |
| Erro leitura | Não foi possível carregar os projetos. / Tentar novamente | CM-040 |
| Erro gravação | Não foi possível salvar o projeto. / Tentar novamente | CM-041 |
| Erro dados | Não foi possível ler os dados dos projetos. / Tentar novamente | CM-042 (sem presunção de cura) |
| Preview fallback | (monograma — sem texto) | silêncio > ruído |
| ⋯ menu | (reservado — V1: duplicar/excluir FR-017) | só quando existir regra |

## 7. Wireframes (área de planejamento do FigCraft — frames simples)

Criados em página "UI - designer", y=5450+, SEM novos mestres/instâncias
(exceto reuso de NADA — tudo frame/texto puro de baixa fidelidade):
- **WF-1 — Home 0 projetos** (1440×900): TopBar [logo|slot] · cabeçalho
  editorial (eyebrow+display+CTA) · composição vazia central tipográfica.
- **WF-2 — Biblioteca ~10 projetos** (1440×900): TopBar · cabeçalho ·
  toolbar (busca/ordenação/grid-lista) · grid 4col de cards de mídia
  (16:9 + faixa info) com 1 hover e 1 "selecionado".
- **WF-3 — Biblioteca 200+** (1440×900): MESMA estrutura; grid denso 5col
  cards menores; contador "212 projetos"; indicador de rolagem real (barra
  lateral + header fixo); **painel de especificação** ao lado listando
  comportamento com N≥50 (virtualização, reflow 960px→3col, teclado).
- **WF-4 — Modo Lista** (1440×900): toolbar idem · lista compacta em
  linhas 48px com colunas nome/criado/aberto + hover.
- **WF-5 — Sem resultado de busca** (720×540 amostra): busca "podc" ·
  lista vazia · estado "Nenhum projeto encontrado para \"podc\"" + Limpar.

Especificações anotadas nos próprios frames (dimensões, gaps, estados).
**Não são UI final** — bloqueios tonais simples, sem tokens de cor além
de 3 tons de cinza para leitura de hierarquia (o render de cor virá na
alta fidelidade, após aprovação desta arquitetura).

## 8. Pendências de decisão (mantenedor)

1. Aprovar a direção "Cut Room" (mídia-first) e os wireframes WF-1..5.
2. Confirmar busca/ordenação/lista como escopo M1 (emenda ao FR-002) ou
   M1.5 — impacto no backlog e no app React.
3. Texto do item único ("a biblioteca cresce com você"?) — CM novo.
4. Atalho de foco de busca (⌘/Ctrl+F) e navegação por setas — validar
   na implementação.
5. Monograma do fallback (inicial única? 2 letras? peso tipográfico?).
6. Consolidação de componentes (§1: TopBar único, ProjectCard único com
   Density/State/showPreview, Button Quiet) — autorizar a fusão e a
   migração de instâncias antigas.
7. Reconciliação formal dos User Flows V2 com D1/DEC-011/BR-049 antes de
   M2 (§3 desta doc; subfluxos listados).
8. Efeitos Libraries.dev: apenas pós-aprovação do layout, com teste de
   desempenho no Windows (registro da proibição atual).
