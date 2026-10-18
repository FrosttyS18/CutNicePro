# CutNicePro — Brand Foundation

Identidade visual oficial do CutNicePro. Base para o design system da próxima revisão
visual. Direção de arte fornecida pelo mantenedor (2026-10-17); aplicação prática
pendente de aprovação visual.

## 1. Posicionamento

Ferramenta profissional de criação e edição automática de cortes de vídeo. A interface é
equipamento: escura, precisa, cinematográfica; o vídeo é o protagonista. Personalidade de
marca vem de detalhes artísticos tridimensionais de vidro escuro — usados com parcimônia,
nunca como decoração de componentes operacionais.

## 2. Tipografia — Poppins

| Peso | Uso |
|---|---|
| Regular (400) | Texto corrido, descrições, transcrições |
| Medium (500) | Labels, controles, tabs |
| SemiBold (600) | Títulos de seções, nomes de painéis |
| Bold (700) | Títulos de tela, destaques de marca, botões primários |

- **Números tabulares obrigatórios** em timecodes, durações e métricas (evita "dança" de
  dígitos em valores que mudam).
- Hierarquia mínima de corpo: 11 px (metadados), 12 px (controles/labels), 13 px (títulos
  de itens), 16 px (títulos de seção), 20+ px (títulos de tela). Evitar < 10 px.
- **Limitação do ambiente:** o FigCraft desta máquina hoje expõe Poppins apenas em
  Regular/Italic/Bold (`text.fonts` verificado). **Pendência:** instalar a família completa
  (Medium/SemiBold) — Poppins é SIL OFL (livre para uso e distribuição com a licença) —
  antes da próxima revisão visual.

## 3. Paleta oficial

| Token | Valor | Função |
|---|---|---|
| `color/pure-black` | `#000000` | Base do produto (fundo do app, áreas de vídeo) |
| `color/attractive-black` | `#231F20` | Superfícies e painéis |
| `color/deep-aqua` | `#02C2BE` | Ações principais, seleção, progresso, estados ativos |
| `color/white-marble` | `#E6E7E8` | Texto e informação principal |

**Auxiliares tonais funcionais** (variações das cores oficiais; nunca substituem a
identidade — valores iniciais, refinar como variáveis no FigCraft na próxima fase):

| Token | Valor | Uso |
|---|---|---|
| `color/marble-70` | `#B9BBBD` | Texto secundário |
| `color/aqua-hover` | `#5AD7D4` | Hover/ativo-intermediário de ações |
| `color/surface-raised` | `#2B2728` | Superfície elevada (cards sobre painéis) |
| `color/border` | `#3A3A3C` | Bordas 1px, separadores |
| `color/track` | `#3A3A3C` | Trilhas de progresso/inativos |

### Contraste (WCAG, calculado sobre os valores hex)

- White Marble sobre Pure Black ≈ 17:1 (AAA); sobre Attractive Black ≈ 13:1 (AAA).
- Deep Aqua sobre Pure Black ≈ 9,4:1 (AAA); sobre Attractive Black ≈ 7,2:1 (AAA).
- Preto sobre Deep Aqua (botão primário) ≈ 9,4:1 (AAA).
- Marble-70 sobre Pure Black ≈ 10,8:1 (AAA); sobre Attractive Black ≈ 8,3:1 (AAA).
- Pendência: definir tokens semânticos de **sucesso/erro/alerta** com contraste verificado
  na próxima fase (não inventar valores agora).

## 4. Direção artística — Dark Glass 3D

Referências técnicas do mantenedor: Abstract 3D Glass Art, Refractive Glass, Smoked Glass,
Glass Ribbons, Optical Refraction, Chromatic Dispersion, Specular Highlights, Dark
Cinematic Lighting.

**Critérios de uso:**

- Aplicar em: onboarding, primeira execução, páginas iniciais, ilustrações de marca,
  estados vazios comemorativos, materiais de apresentação.
- **Não** aplicar em: painéis operacionais, controles densos, timeline, inspetor.
- **Não** é glassmorphism de componente: nada de cartões translúcidos, blurs decorativos
  ou gradientes gratuitos na interface operacional.
- Elementos 3D devem ser produções originais ou devidamente licenciadas; sem logos nem
  assets de terceiros sem direitos.

## 5. Geometria e ritmo

- **Espaçamento:** escala 4 / 8 / 12 / 16 / 24 / 32 (múltiplos de 4).
- **Raios:** 4 px (micro-elementos), 6 px (controles/botões), 8 px (painéis e cards),
  12 px (modais e superfícies grandes).
- **Bordas:** 1 px `color/border` para separação; elevação por superfície + borda, não por
  sombras difusas pesadas.
- **Controles operacionais:** compactos (28-34 px de altura), alvo de toque confortável
  onde aplicável.

## 6. Arquivos desta fundação

- `design/tokens/tokens.json` — valores de máquina (cores, tipografia, espaçamento, raios).
- `design/tokens/tokens.md` — guia de aplicação e mapeamento para variáveis do FigCraft.

## 7. Decisões pendentes

1. Instalar pesos Medium/SemiBold do Poppins (OFL) no sistema/FigCraft.
2. Tokens semânticos de status (sucesso/erro/alerta) com contraste verificado.
3. Aplicação concreta da paleta nas Propostas A e B (próxima revisão visual — não é mera
   troca de cores: ver `docs/design/NEXT-REVISION-GUIDELINES.md`).
4. Produção dos ativos 3D de vidro escuro (originais) para onboarding/empty states.
