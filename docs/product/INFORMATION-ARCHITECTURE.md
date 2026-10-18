# CutNicePro — Information Architecture

> Derivada de JRN-001..011 e BR-001..036. Decide a **materialização** de cada etapa
> (tela, painel, modal, estado contextual ou ação inline) — não presume uma página por item.
> As propostas FigCraft A/B são estudos: B inspira o ambiente de **revisão**, A o **editor
> avançado**; nenhuma substitui Home/onboarding/fluxos de suporte (UX-FOUNDATION §8).

## 1. Sitemap funcional

```
App
├── PrimeiraExecução (estado do App, não tela obrigatória — D1/JRN-001)
│     └── apresentação curta OU entrada direta → Home
├── Home / Biblioteca de Projetos (tela)
│     ├── [vazia] orientação + CTA "Criar projeto"
│     ├── [com projetos] lista + retomar/abrir + duplicar/excluir (V1)
│     └── [item indisponível] diagnóstico (BR-032)
├── Projeto (workspace — ambiente único com estados)
│     ├── Painel Mídia (importação, estados da mídia)         [JRN-004]
│     ├── Painel Modo + Configuração de geração               [JRN-005/006]
│     ├── Painel Processamento (job ativo/histórico)          [JRN-007]
│     ├── Ambiente de Resultados/Revisão (inspirado na Proposta B) [JRN-008]
│     │     └── Prévia rápida + ações por corte (inline)
│     ├── Editor Avançado (tela dedicada, inspirada na Proposta A) [JRN-009]
│     └── Exportação (painel de configuração + fila)          [JRN-010]
└── Configurações do App (painel/modal — mínimo no MVP)
```

## 2. Decisões de materialização

| Etapa (jornada) | Materialização | Justificativa |
|---|---|---|
| Primeira execução (JRN-001) | Estado contextual (≤3 painéis) ou entrada direta — D1 a validar | Evitar onboarding artificial |
| Home (JRN-002) | Tela | Ponto de retomada e identidade |
| Criação de projeto (JRN-003) | Modal curto (nome + local com padrões) | Ação pontual, não merece tela |
| Importação (JRN-004) | Dropzone + ação inline no Painel Mídia; progresso por item inline | Lote com feedback local |
| Escolha de modo (JRN-005) | Seleção contextual no workspace (cartões de modo) | Decisão de intenção, não navegação |
| Configuração de geração (JRN-006) | Painel com padrões; avançados recolhidos | Defaults primeiro (H2) |
| Processamento (JRN-007) | Painel de job com estágios/progresso; sem modal bloqueante | Usuário continua no projeto |
| Resultados (JRN-008) | Ambiente principal do workspace (revisão) | Coração do produto |
| Edição avançada (JRN-009) | Tela dedicada com retorno ao workspace | Foco; densidade própria |
| Exportação (JRN-010) | Painel de configuração + fila; toast/estado de conclusão | Ação de saída do fluxo |
| Continuidade (JRN-011) | Estados + diálogos de confirmação | Sem tela própria |

## 3. Pontos de entrada e navegação

- Entradas: executável → Home; Home → Projeto (workspace); workspace → Editor; tudo
  navegável por teclado (NFR-005).
- Retorno: Editor → workspace (salvar/descartar); workspace → Home (job pode continuar — BR-014).
- Sem menus aninhados profundos; navegação global ≤ 2 níveis (UX-FOUNDATION §2).

## 4. Estados vazios e de erro (por área)

| Área | Vazio | Erro |
|---|---|---|
| Home | Orientação + CTA criar projeto | Projeto indisponível → diagnóstico |
| Painel Mídia | Dropzone protagonista | Item com falha (causa + retry) sem abortar lote |
| Configuração | Defaults aplicados | Combinação impossível → aviso pré-execução |
| Processamento | "Nenhum job" + atalho configurar | Falha parcial/total com causa e ação |
| Resultados | "Gere cortes" com atalho | — (segue estado do job) |
| Editor | — (sempre abre com corte) | Falha ao salvar → versão anterior intacta |
| Exportação | "Nada selecionado" + atalho revisão | Falha por item; conflito de nome → confirmação |

## 5. Matriz de transições entre experiências

| De \ Para | Home | Workspace | Editor | Exportação |
|---|---|---|---|---|
| Home | — | Abrir/criar projeto | — | — |
| Workspace | Voltar (job continua) | — | Editar corte aprovado/sugerido | Iniciar exportação |
| Editor | — | Retornar (salvar/descartar) | — | — |
| Exportação | — | Concluir/voltar | — | Repetir (fila) |

Regras de guarda: Editor exige corte selecionado; Exportação exige ≥1 corte aprovado/edição
válida (BR-021); Home←Workspace não interrompe job ativo (BR-014/BR-015).
