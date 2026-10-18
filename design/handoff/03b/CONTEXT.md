# Fase 03B — Handoff Context (extração FigCraft, modo leitura)

Fonte: `design/cutnicepro-fase01-propostas.figcraft`, página "UI - designer", frames importados pelo mantenedor.
Extração: get_node (estrutura exata) + screenshots + relatório VISION. **FigCraft em MODO LEITURA nesta fase.**

## Tokens globais

| Token | Valor | Uso |
|---|---|---|
| bg-app | `#000000` | fundo do frame raiz (1440×900, r30 no design = janela) |
| bg-panel | `#0A0A0A` | painel principal de conteúdo (r20) |
| surface | `#1E1E1E` | pills ativos, botões, cards, badges |
| surface-dim | `#202020` | container do ícone da pasta de coleção (32×32 r4) |
| divider-rail | `#101010` | linha vertical do rail (x=92, 1px) |
| divider-panel | `#202020` | linha horizontal do breadcrumb (y=45.5 no painel) + divisor inferior do rail (80×1) |
| text-primary | `#FFFFFF` | títulos, item atual do breadcrumb, aba ativa |
| text-secondary | `#929292` | subtítulos, metadados, abas inativas, texto de ações secundárias |
| accent | `#02C2BE` | ícone do rail ATIVO, underline das abas (1px) |
| breadcrumb-inactive | `#1E1E1E` | crumbs anteriores ao atual (e ">" separadores) |
| fonte | Poppins 400/500/600/700 (app embute via @fontsource) | design usa Regular/Bold/Semi Bold/Light |

## Shell (comum às telas 2–6)

- Janela 1440×900, fundo `#000000`.
- **Rail** (sempre visível): 0→92px. Divisor vertical `#101010` em x=92 (altura total).
  - Avatar "Perfil": 42×42 círculo, (24,24), imagem mock.
  - Ícones 24×24 em x=33: home y=87, package (Meus Projetos) y=135; alinhados com pills do painel (y=82/130 → ícone ~5px abaixo do topo do pill).
  - Settings `hugeicons:configuration-01` 24×24 em (33,787).
  - Divisor horizontal 80×1 `#202020` em (5.5,819).
  - Logo diagonal CutNicePro 48.5×41 em (24,835) → `logo-sidebar.svg`.
  - Ícone ativo = teal `#02C2BE`; inativo = `#1E1E1E`. (No arquivo, o component home tem default teal — artefato; semântica implementada: só o ativo é teal.)
- **Painel secundário** (só expandido): 92→361 (269px). Header de seção Poppins 12 `#FFFFFF` em (108,36); pills 221×34 r8 padding 8, texto Poppins 12 `#FFFFFF` x+8/y+8:
  - ativo: fill `#1E1E1E`; inativo: sem fill.
  - Home: header "Home", pill "Início" (y=82).
  - Projetos: header "Meus Projetos", pills "Todos" (y=82) e "Coleções" (y=130).
- **Painel principal**: expandido → (361,24) 1055×845 r20 `#0A0A0A` clip; recolhido → (116,24) 1300×845.
- Header do painel principal: breadcrumb em (16,16): [ícone 16×16 r4 `icon-breadcrumb-logo.svg`] + crumbs Poppins 12 gap 9, separador ">", anteriores `#1E1E1E`, atual `#FFFFFF`; divisor `#202020` largura total em y=45.5.

## Tela 1 — Splash (frame 1331)

1440×900 `#000000`. Logo central (507.43×96, centrado): wordmark horizontal "Cut"(branco) "Nice"(teal) + símbolo PR-tesoura (branco) + 2 crop marks 27.43×27.43 → `logo-splash.svg`. Sem delays artificiais: splash só cobre o boot real.

## Tela 2 — Home Expandida (1338) / Tela 3 — Home curta (1384)

Painel principal:
- `image 26` (contact sheet artístico): 1156×555 centrado (x=-50/72, y=46), r12 na versão curta, crop. → `home-contact-sheet.png`.
- `image 25` (faixa inferior): 1056×215 em y=635 (bottom), crop. → `home-strip-bottom.png`.
- "Bem-Vindo ao Cut Nice Pro" Poppins 34 Bold `#FFFFFF`, centrado (y=324 no painel, 763 de largura).
- "Crie seu novo projeto +" Poppins 20 Regular `#929292` (y=375).
- Botão "Criar Projeto" 221×34 r8 `#1E1E1E`, texto Poppins 12 `#FFFFFF` centrado (y=421).
- Breadcrumb: Home > Início.
- z-order: imagens < textos < botão. Sem overlay de escurecimento no design.
- Animações pedidas: ContactSheet (verificar licença ReactBits Pro; senão implementação própria, 9:16/16:9/1:1, prefers-reduced-motion) + Halftone wordmark (arquivo MIT do mantenedor NÃO está na sessão → implementação própria, wordmark "CutNicePro", sem footer/links/laranja/"halden").

## Tela 4 — Meus Projetos > Todos (1427)

- Painel: breadcrumb "Meus Projetos > Todos".
- Abas Poppins 14 y=66: "Todos (1)" `#FFFFFF` (x=17) ativa; "Clipes (1)" `#1E1E1E` (x=98). Underline teal 1px (66px) x=16 y=90 (sob a aba ativa, largura ≈ texto).
- Grade: cards 221px, gap 16, início (16,123).
- Card novo (1º): 221×147 r8 fill `#1E1E1E`, borda tracejada [4,4] `#929292` 1px inside, conteúdo centrado: "+" Poppins 25 Light `#929292` + "Enviar novo vídeo" Poppins 12 `#929292` (2 linhas).
- Card projeto: GROUP 221×151 — thumb 221×109 r8 clip (imagem fill + overlay `#000000` 30%) + badge "Novo" 30×11 r26 `#1E1E1E` texto Poppins ~7.85 `#FFFFFF` canto sup. dir. (x=187,y=4) + título Poppins 14 `#FFFFFF` centrado (4px após thumb) + meta Poppins 10 `#929292` centrado ("1 clipe - 18.10.2026").

## Tela 5 — Meus Projetos > Coleções (1482)

- Breadcrumb "Meus Projetos > Coleções". Abas: "Coleções (1)" ativa / "Clipes (1)" (mesmo estilo da tela 4).
- Cards 221×61 r8 `#1E1E1E`, gap 16, y=123:
  - Novo: tracejado [4,4] `#929292`; ícone "+" 11×11 `#929292` + "Adicionar Nova Coleção" Poppins 12 `#929292`, centrado horizontal.
  - Coleção: ícone 16–22px à esquerda (padding 16) + 2 linhas: nome Poppins 12 `#FFFFFF` / "N Clipe" Poppins 8 `#929292`. Design usa "0 Clipe"; implementar plural pt-BR correto ("0 clipes"/"1 clipe") conforme skill ux-writing.
  - Ícones das coleções do design: `ant-design:heart-filled` (Favoritos), `reicon:archive-box` (Mr beast) → SVGs exportados.

## Tela 6 — Coleções > Pasta (1540)

- Breadcrumb 3 níveis: "Meus Projetos > Coleções > Mr Beast" (no arquivo o último crumb está `#1E1E1E`; padrão das demais telas = atual `#FFFFFF` → implementar branco, registrar divergência).
- Header da pasta (y=70): ícone 32×32 r4 `#202020` com archive-box 22×22 branco dentro; "Mr beast" Poppins 14 SemiBold `#FFFFFF`; abaixo "1 Projeto ❘ 0 Clipe" Poppins 8 `#929292` e à direita "Última atualização: 18.10.2026" Poppins 8 `#929292`.
- Abas menores Poppins ~10.2 y=122: "Todos (1)" ativa `#FFFFFF` / "Projetos (1)" / "Clipes (0)" `#1E1E1E`; underline teal 48×0.73 y=139.5.
- Cards de projeto idênticos aos da tela 4, y=181.

## Assets exportados (design/handoff/03b/)

`01..06-*.png` screenshots | `logo-splash.svg` | `logo-sidebar.svg` | `icon-home.svg` | `icon-projects.svg` | `icon-settings.svg` | `icon-breadcrumb-logo.svg` | `icon-heart.svg` | `icon-archive-box.svg` | `home-contact-sheet.png` (2x) | `home-strip-bottom.png` (2x) | `avatar-perfil.png` (2x) | `thumb-mock-projeto.png`

## Limitações e decisões

1. `halftone-wordmark-footer.tsx` (MIT do mantenedor) não presente na pasta nem no repo → implementação própria do efeito halftone.
2. Fotos (avatar, thumbs MrBeast, contact sheet) são mocks do design sem licença de redistribuição verificada → uso local no app; NÃO publicar em repo público sem verificação (restrição permanente do projeto).
3. Component home com stroke default teal no arquivo = artefato; semântica implementada: ativo teal / inativo `#1E1E1E`.
4. Último crumb da tela 6 `#1E1E1E` no arquivo; padrão implementado: atual `#FFFFFF`.
5. "0 Clipe" no design → plural correto pt-BR na implementação.
6. Contadores das abas/pills refletem dados reais persistidos (sem dados fictícios).
