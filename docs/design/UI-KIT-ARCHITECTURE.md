# CutNicePro — UI Kit Architecture (Fase 01 → 02)

Arquitetura de componentização para a próxima revisão visual. Baseada em: auditoria
estrutural das Propostas A/B (2026-10-17), teste controlado de componentes nativos do
FigCraft 0.6.0 (validado) e direção de UX (`docs/product/UX-FOUNDATION.md` §8:
AI Clip Workspace principal / Creative Studio editor avançado).

## 1. Capacidade verificada do FigCraft 0.6.0 (evidências do teste controlado)

Comandos reais disponíveis e validados com documento descartável:
`component.create`, `instance.create`, `instance.place`, `component.combineVariants`,
`component.addVariant` (após combine), `component.editProperty` (renomear propriedade/valores),
`instance.setProperties` (troca de variante), overrides em instâncias (ex.: `characters` com
`"overrides": ["characters"]`), `object.convertToFrame/Group`, `object.resizeToFit`,
auto layout (`layout/gap/padding/mainAlign/crossAlign` via `node.set`),
`inspect.code` / `inspect.componentCode` (gera React+CSS com flexbox e valores corretos),
`component.list`, `variable.bind`, `style.create`/`library.publish` (estilos/bibliotecas).
Evidência: `docs/reports/evidence/2026-10-17_figcraft-component-test.png` + relatório
`2026-10-17_*` em `docs/reports/history/`.

## 2. Critérios de componentização

- Componentizar **apenas repetição real**: elementos que aparecem ≥ 3 vezes ou que carregam
  comportamento/estado próprio. Texto solto e retângulos simples continuam camadas.
- Todo componente mestre recebe: nome semântico (`ClipCard`, `Button/Primary`), auto layout
  interno, fills/raios/gaps ligados a variáveis/tokens, e propriedades expostas quando o
  consumidor precisa variar conteúdo (texto, slot).
- Instâncias em tela **nunca** são cópias independentes (a auditoria de 2026-10-17 mostrou
  que A e B têm 0 instâncias — a próxima revisão deve demonstrar o contrário).
- Frames semânticos aninhados (não componentes) organizam as telas:

```
AppShell
  TopBar
  MainWorkspace
    MediaSidebar
    ClipsList
    PreviewPanel
    InspectorPanel
  StatusBar
```

- Metas estruturais da próxima revisão: profundidade 3-4; cada painel com seus filhos
  (nada de centenas de camadas soltas na raiz — hoje A tem 151 e B 127 filhos diretos);
  listas/painéis em auto layout.

## 3. Componentes candidatos

| Componente | Variantes | Propriedades | Estados | Telas |
|---|---|---|---|---|
| `Button` | Primary (aqua), Secondary (borda), Ghost | `label`, `icon?`, `size` (sm/md) | default, hover, disabled, loading | todas |
| `IconButton` | Default, Active | `icon`, `tooltip` | default, hover, disabled | topbar, player, timeline |
| `Input` / `Field` | Text, Search | `label`, `placeholder`, `value` | default, focus, error, disabled | inspetor, geração |
| `Toggle` | — | `label`, `checked` | on, off, disabled | legendas, áudio |
| `StatusBadge` | Revisado, Processando, Erro, Pronto | `label` | — | listas, fontes, exportação |
| `ProgressBar` | Determinate, Indeterminate | `value` | — | geração, exportação, lote |
| `StepIndicator` | — | `steps[]`, `current` | done, current, todo | workspace B |
| `ClipCard` | Compact, Detailed | `title`, `meta`, `score`, `format`, `revised` | default, selected, processing | workspace B |
| `MediaItem` | Source | `name`, `meta`, `status` | default, hover, error | sidebars A/B |
| `VideoPreview` | 16:9, 9:16, 1:1 | `format`, `captions` | playing, paused, empty | A e B |
| `TimelineTrack` | Video, Audio, Caption | `label` | — | Creative Studio |
| `TimelineClip` | — | `label`, `duration`, `selected?` | default, selected, adjusted | Creative Studio |
| `InspectorSection` | — | `title`, `slot` | collapsed, expanded | inspetor A (e B futuro) |
| `ExportAction` | Single, Batch | `count` | idle, running, done, error | A e B |
| `EmptyState` | — | `title`, `hint`, `art?` (dark glass) | — | biblioteca, lista, exportação |

`EmptyState` é o único candidato a receber os materiais 3D de vidro escuro da marca.

## 4. Correspondência FigCraft ↔ frontend futuro

| FigCraft | Frontend (conceitual) |
|---|---|
| Component mestre | Componente React/Vue com props |
| Propriedade de componente (`component.addProperty`: text/boolean/variant/slot) | Props tipadas |
| Variant set (`State=Default/Hover`) | Union de variantes / `data-state` |
| Instância + overrides | Uso do componente com props distintas |
| Slot (`component.makeSlot`) | `children` / slot de composição |
| Variáveis (`color/*`, `space/*`, `radius/*`) | CSS custom properties do `tokens.json` |
| Auto layout (gap/padding/align) | Flexbox — `inspect.componentCode` já emite `display:flex; gap; padding` corretamente (validado no teste) |
| `codeConnect.set` / `figcraft.connect.json` | Ligação design→código versionada no repo frontend |

## 5. Regras de manutenção

- Mestre editado → instâncias seguem (validado no teste: correção de fill no mestre
  propagou às instâncias automaticamente).
- Override de instância documentado (só conteúdo/propriedades expostas).
- Novo componente entra aqui antes de entrar no arquivo de design.
