# M1 Content Matrix — UX Writing (pt-BR)

> Gate de conteúdo da Fase M1 (pós-HOLD, pré-retomada visual).
> REVISADA na retomada controlada Studio Console (2026-10-18): CM-002,
> CM-033, CM-042 e CM-011 corrigidas conforme instruções do mantenedor. Textos
> PROPOSTOS para aprovação do mantenedor — nenhum foi aplicado a telas ou
> código. Estado de funcionalidade sempre declarado (atendente ao princípio
> de honestidade da skill cutnicepro-ux-writing). Convenciona-se
> [APROVADO] apenas para textos já validados pelo mantenedor; tudo aqui é
> [PROPOSTO] até revisão.

## Tela 1 — Home sem projetos

| ID | Elemento | Texto | Contexto | Ação | Justificativa de UX | Estado func. |
|---|---|---|---|---|---|---|
| CM-001 | Título do empty state | **Nenhum projeto ainda** | Primeira execução; biblioteca vazia | — | Nomeia o estado (não a tarefa); sem promessa; sentence case | Existe (M1) |
| CM-002 | Frase de contexto | **Crie um projeto para começar. Ele ficará salvo neste computador.** | Abaixo do título | — | Corrigida pelo mantenedor: apenas o que o M1 faz (criar + persistir local); sem promessa de gestão de vídeos ainda inexistente | Verdadeiro no M1 (persistência local) |
| CM-003 | CTA | **Novo projeto** | Botão primário único | Abre o diálogo | Rótulo oficial do glossário; CTA único (AC-004) | Existe (M1) |
| CM-004 | TopBar (esquerda) | **CutNicePro** (wordmark) | Cabeçalho | — | Sem chips de versão/protótipo na interface comercial (regra 6 da skill) | Existe (M1) |
| CM-005 | TopBar (direita) | *(vazio na versão comercial)* | — | — | Rótulos internos "M1 · protótipo"/"v0.1.0" REMOVIDOS do design futuro; se necessário em build de teste, apenas em variantes internas | Pendente de decisão visual |

## Tela 2 — Home com projetos

| ID | Elemento | Texto | Contexto | Ação | Justificativa | Estado func. |
|---|---|---|---|---|---|---|
| CM-010 | Título da seção | **Projetos** | Cabeça da biblioteca | — | Vocabulário oficial | Existe (M1) |
| CM-011 | Contador | **1 projeto** / **2 projetos** (plural computado, nunca literal "projeto(s)") | Ao lado do título | — | Conta apenas projetos REAIS da lista (card de ação não conta; em mock, o número confere com os cards visíveis/declarados); sem sufixo redundante; números de projetos, cortes ou uso nunca fabricados | Existe (M1) |
| CM-012 | CTA da seção | **Novo projeto** | Botão primário no cabeçalho da seção | Abre o diálogo | Mesmo rótulo oficial do empty state — um conceito, uma palavra nos controles | Existe (M1) |
| CM-013 | Nome do projeto (card) | *dinâmico* — ex.: "Podcast — Ep. 12" | Linha principal do card | Abrir | Conteúdo do usuário; placeholder "Nome do projeto" só no mestre, nunca renderizado como dado | Existe (M1) |
| CM-014 | Meta linha 1 | **Criado {absoluto}** — "Criado 18 de out de 2026" | Metadado do card | — | Criação pede referência estável → absoluto completo pt-BR | Existe (M1) |
| CM-015 | Meta linha 2 | **Aberto {relativo}** — "Aberto há 2 h" / "Aberto ontem" / "Nunca aberto" | Metadado do card | — | Acesso pede proximidade temporal → relativo; formato único por tipo de dado | Existe (M1) |
| CM-016 | Meta — cortes/durações | *(ausente)* | — | — | Dado de feature M4 não renderizado como atual (anti-padrão auditado) | Inexistente (M4) |
| CM-017 | Ação do card | **Abrir** | Controle discreto no card (ou card clicável) | Abre o projeto | Verbo único do glossário; sem pill aqua repetida em 5 cards (direção visual) | Existe (M1) |
| CM-018 | Estado loading | *(skeleton, sem texto)* + acessível "Carregando projetos…" | Durante leitura | — | Skeleton silencioso; aria-label para leitores | Existe (M1) |

## Tela 3 — Diálogo Novo projeto

| ID | Elemento | Texto | Contexto | Ação | Justificativa | Estado func. |
|---|---|---|---|---|---|---|
| CM-020 | Título | **Novo projeto** | Modal sobre a Home | — | Igual ao botão que o abriu (regra de diálogos) | Existe (M1) |
| CM-021 | Contexto (1 linha) | **O projeto fica salvo neste computador.** | Logo abaixo do título | — | ÚNICA menção de local-first no diálogo (remove a duplicação auditada) | Verdadeiro no M1 |
| CM-022 | Label do campo | **Nome** | Label do input | — | Curto; o contexto "do projeto" já está no título | Existe (M1) |
| CM-023 | Placeholder | **Ex.: Podcast — Ep. 12** | Exemplo real dentro do campo | — | Regular (sem itálico), não duplica o label | Existe (M1) |
| CM-024 | Helper | *(removido)* | — | — | Função absorvida pelo CM-021; sem redundância na tela | — |
| CM-025 | Validação — vazio | **Informe um nome para o projeto.** | Erro inline | — | Diz o esperado; já validada | Existe (M1) |
| CM-026 | Validação — limite | **Nome muito longo (máx. 80 caracteres).** | Erro inline | — | Diz o esperado; já validada | Existe (M1) |
| CM-027 | Ações | **Cancelar** · **Criar** | Rodapé do diálogo | Fechar / criar | Glossário; "Cancelar" substitui "Descartar" (vago) | Existe (M1) |

## Tela 4 — Projeto aberto (workspace M1)

| ID | Elemento | Texto | Contexto | Ação | Justificativa | Estado func. |
|---|---|---|---|---|---|---|
| CM-030 | Breadcrumb | **← Projetos** | Voltar à Home | Volta | Glossário | Existe (M1) |
| CM-031 | Título | *dinâmico* — nome do projeto | Cabeça do workspace | — | Conteúdo do usuário | Existe (M1) |
| CM-032 | Meta | **Criado {absoluto} · Aberto {relativo}** | Linha única sob o título | — | Mesmas regras de data dos cards | Existe (M1) |
| CM-033 | Corpo do workspace (M1) | *(sem copy — área central reservada em silêncio)* | Painel central do workspace | — | Corrigida pelo mantenedor: o workspace M1 exibe SOMENTE o disponível (breadcrumb, nome, metadados); zero referência a ciclos internos ou funcionalidades futuras — sem texto prometendo importação | Importação = inexistente (M2); nenhuma menção na tela |
| CM-034 | Nota de rodapé | *(removida da versão comercial)* | — | — | "Protótipo funcional M1 — interface provisória…" é ruído interno (regra 6); comunica estado por canais internos, não na tela | — |

## Tela 5 — Loading, erro e recuperação

| ID | Elemento | Texto | Contexto | Ação | Justificativa | Estado func. |
|---|---|---|---|---|---|---|
| CM-040 | Erro de leitura | **Não foi possível carregar os projetos.** + **Tentar novamente** | Banner de erro | Retry | Causa genérica honesta + ação única (o M1 não expõe detalhe de disco) | Existe (M1) |
| CM-041 | Erro de gravação | **Não foi possível salvar o projeto.** + **Tentar novamente** | Falha ao criar/abrir | Retry | Idem; o storage atômico protege o estado anterior | Existe (M1) |
| CM-042 | Arquivo corrompido | **Não foi possível ler os dados dos projetos.** + **Tentar novamente** | projects.json inválido | Retry NÃO presume recuperação (corrupção persistente exige inspeção técnica) | Corrigida pelo mantenedor: mensagem sem promessa de cura; proibido substituir dados existentes por lista vazia silenciosamente (o Rust já preserva o arquivo e falha explicitamente — cargo test); controle de recuperação definitivo = não inventado, pendente de decisão | Existe (M1 — leitura falha explicitamente; recuperação avançada pendente) |
| CM-043 | Aviso offline (informativo) | **Sem conexão — seus projetos continuam salvos neste computador.** | StatusFeedback Info | — | Reafirma BR-049 aprovada (nunca apagar por falha); sem prometer processamento offline (política comercial pendente) | Parcial (app é local; aviso projetado) |
| CM-044 | Recuperação pós-retry | *(estado volta a "Carregando…" → listagem)* | Após Tentar novamente | — | Ciclo visível loading→conteúdo; sem toast de sucesso desnecessário | Existe (M1) |

## Pendências de cópia (decisão do mantenedor)

1. CM-005: o que (se algo) aparece na TopBar direita na versão comercial
   (conta/configurações só existem no M6 — recomendação: vazio).
2. CM-043: incluir ou não o aviso offline no M1 (o processamento local é
   o modo normal; o aviso pode ser desnecessário até haver validação de
   assinatura online no M6).
3. Nome do app na interface: "CutNicePro" (sem espaços) confirmado como
   wordmark textual? (o logo definitivo é decisão de marca pendente).
