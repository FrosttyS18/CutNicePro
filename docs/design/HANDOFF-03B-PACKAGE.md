# Pacote de Handoff — Figma → CutNicePro (Fase 03B)

> Estado: **BLOCKED no acesso programático ao design**. Este documento
> especifica o pacote de handoff necessário para retomar a Fase 03B sem
> que o mantenedor copie CSS manualmente. Nenhuma implementação visual foi
> feita (nenhuma tela, componente ou estilo do app foi alterado).

## Por que BLOCKED (síntese técnica)

1. **MCP Desktop (127.0.0.1:3845/mcp)**: conexão OK (initialize +
   Mcp-Session-Id + 6 ferramentas listadas), mas **todo `tools/call` de
   arquivo retorna** `This resource couldn't be accessed...paid Figma seat
   includes Dev Mode access, right permissions, valid link` — testado com
   o fileKey correto **e** com o incorreto (ambos idênticos; causa raiz
   é a exigência de assento Dev/Full no plano da conta, não o fileKey).
2. **MCP remoto (https://mcp.figma.com/mcp)**: exige OAuth 2.0 Bearer.
   O **registro dinâmico de cliente** (`api.figma.com/v1/oauth/mcp/register`)
   retorna **403 Forbidden** — a documentação oficial confirma que só
   clientes do **catálogo Figma MCP** (VS Code, Cursor, Claude Code,
   Codex) podem conectar; novos clientes precisam de waitlist. Sem
   `client_id`, não há fluxo de autorização a abrir no navegador.
   Testes executados: 1× POST sem token (401 + WWW-Authenticate),
   2× POST com Originator (401), 2× registro dinâmico (403). Total de
   chamadas ao remoto: 5 (respeitando limites do plano gratuito).

## Solução recomendada (sem waitlist)

O mantenedor já possui um cliente autorizado conectado ao MCP oficial do
Figma (o ChatGPT, conforme informado). Por ele, extrair **uma vez** o
pacote abaixo e entregar em `design/handoff/03b/`:

### 1. Design context dos seis frames (o item essencial)

Para cada node, executar `get_design_context` e salvar o resultado como
`<node>-context.json` (ou `.md` se vier texto):

| Arquivo alvo | Node ID | Tela |
|---|---|---|
| `1-2-context` | `1:2` | Ao abrir o App (Splash) |
| `1-57-context` | `1:57` | Home — expandida |
| `3-774-context` | `3:774` | Home — recolhida |
| `1-159-context` | `1:159` | Meus projetos — Todos |
| `1-529-context` | `1:529` | Meus projetos — Coleções |
| `1-608-context` | `1:608` | Coleções > Pasta de coleção |

O `get_design_context` já traz hierarquia, layout, cores, tipografia,
código de referência e imagens/SVGs inline — é o único artefato
realmente indispensável por frame.

### 2. Screenshots de referência

`get_screenshot` por frame → `<node>-screenshot.png` (mesmos 6 nodes).
Referência principal: 1440×900.

### 3. Variáveis/tokens

`get_variable_defs` em `1:57` → `variables.json` (paleta local:
#0A0A0A, #1E1E1E, #929292 etc.).

### 4. Assets avulsos (se não vierem inline no context)

- Logo vetorial do Splash (`1:2`) como **SVG**.
- Ícones da sidebar (home/projetos/coleções + setas) como SVG.
- Miniaturas usadas no contact sheet da Home (PNG/JPG, **com origem
  e licença anotadas** — repositório é público).

### 5. Instruções de comportamento (texto livre do mantenedor)

- Contact sheet: velocidade/direção/curva; formatos por item (9:16,
  16:9, 1:1); comportamento com 0 projetos.
- Halftone wordmark: texto exato do wordmark; código-fonte
  `halftone-wordmark-footer.tsx` já fornecido pelo mantenedor (MIT)
  deve ser entregue em `design/handoff/03b/halftone-wordmark-footer.tsx`
  se não estiver na sessão em que a 03B retomar.
- Abas de "Meus projetos" (nomes exatos), metadados dos cards e o que
  aparece em "novo projeto/vídeo" quando o M2 não existe ainda.

## Estrutura local já preparada

- `tools/figma/figma_client.py` — cliente JSON-RPC completo (sessão
  Desktop OK; comandos `shot/context/meta/vars/raw` prontos; quando o
  assento permitir, os mesmos comandos extrairão tudo automaticamente).
- `docs/reports/evidence/figma-03b/` — pasta de destino criada.
- Correção cirúrgica do harness identificada e mapeada (futura):
  `check_app_tests` deve procurar `package.json` também em `app/` e
  executar `npm test` lá (linhas 94–112 de
  `.zcode/hooks/harness/baseline_checks.py`); a executar apenas na
  retomada da 03B (ETAPA E), conforme autorizado pela missão original.

## Checklist de retomada da Fase 03B

1. Pacote em `design/handoff/03b/` (seções 1–5 acima) **ou** assento
   Dev Mode ativo no Figma Desktop (o cliente local passa a funcionar
   sem nenhuma outra mudança).
2. Auditoria do app React/Tauri (iniciada: componentes
   EmptyState/ErrorBanner/NewProjectDialog/ProjectList/ProjectView;
   lib format/ipc/projects/types; IPC list/create/open_project;
   persistência Rust intocada).
3. ETAPAS A–E da missão original (foundation → home → biblioteca →
   validação), comparando cada tela com os screenshots do pacote.
