# CutNicePro — Diretrizes da Próxima Revisão Visual (Fase 02)

Lista objetiva e verificável para a próxima iteração das Propostas A e B. As propostas
atuais (`design/cutnicepro-fase01-propostas.figcraft`) ficam preservadas como exploração
inicial aprovada — **não** como design de produção.

## 1. Diagnóstico atual (evidências da auditoria de 2026-10-17)

Problemas apontados pelo mantenedor, confirmados por auditoria estrutural:

| Problema | Evidência medida |
|---|---|
| Aparência de dashboard genérico / sem personalidade | Composição por retângulos planos uniformes; sem identidade aplicada |
| Excesso de blocos repetitivos | A: 61 retângulos; B: 45 — linhas de lista e toggles duplicados como cópias |
| Ausência de hierarquia na árvore | Profundidade máxima 1 em ambas; 151 e 127 filhos diretos da raiz |
| Falta de reutilização | 0 componentes, 0 instâncias, 0 grupos em A e B |
| Sem auto layout | 0 frames com layout (tudo absoluto) |
| Propriedades repetidas sem tokens | 17 cores distintas em A / 15 em B, repetidas (ex.: #9AA3AF ×33); 9-10 combinações tipográficas ad hoc |
| Excesso de placeholders | Miniaturas/preview como retângulos vazios |
| Identidade oficial não aplicada | Inter em uso; paleta provisória azul; nada de Poppins/aqua/marble |

## 2. Exigências da próxima versão

**Identidade**
1. Poppins em toda a UI (instalar Medium/SemiBold antes — pendência registrada).
2. Paleta oficial e auxiliares APENAS via variáveis do FigCraft (`color/*` do
   `design/tokens/`); hex solto = reprovação.
3. Números tabulares em todos os timecodes/métricas.
4. Deep Aqua escasso: ações primárias, seleção/ativo, progresso.

**Estrutura**
5. Frames semânticos aninhados (AppShell → TopBar/MainWorkspace/painéis → filhos);
   profundidade alvo 3-4; máximo ~30 filhos diretos por frame.
6. Auto layout em listas, linhas, barras de botões e painéis (flexível, não absoluto).
7. Componentes do UI Kit (`docs/design/UI-KIT-ARCHITECTURE.md`) para toda repetição
   real; instâncias com overrides — zero cópias idênticas soltas.
8. Nomes de camada consistentes e semânticos (sem "Rectangle 47").

**Composição**
9. Espaçamento intencional na escala 4/8/12/16/24/32; ritmo vertical consistente.
10. Textos maiores e com mais contraste (mínimo prático 11 px; hierarquia por peso/tamanho
    da escala tipográfica).
11. Substituir placeholders vazios por previews demonstrativos apropriados (frames de
    vídeo com conteúdo representativo, thumbnails com proporção correta por formato).
12. Controles operacionais compactos (28-34 px) e funcionais — sem inflar por estética.
13. Estados coerentes: hover, selected, disabled, processing e empty desenhados (mínimo:
    selected + um estado desabilitado/processando por componente interativo).
14. Aba Layers deve mostrar hierarquia profissional legível.

**Direção de arte**
15. Dark glass 3D somente em onboarding/estados vazios de marca (nunca em painéis
    operacionais); sem glassmorphism de componente, sem gradientes decorativos.
16. Nada de visual de landing page dentro do editor operacional.

## 3. Critério de qualidade (gates de aprovação)

A próxima versão NÃO será considerada pronta por captura visualmente aceitável. Exige:

1. **Inspeção visual** (screenshot + revisão independente VISION contra estas diretrizes).
2. **Inspeção estrutural** (contagens: profundidade, filhos por frame, componentes,
   instâncias, cobertura de auto layout — metas acima).
3. **Validação de componentes** (instâncias reais, overrides, variantes de estado).
4. **Conformidade com a identidade** (tokens/variáveis aplicados; Poppins; aqua escarro;
   contraste verificado).

Mudança de cor isolada **não** conta como redesign.

## 4. Fora de escopo da próxima revisão

- Redesenho completo beyond essas diretrizes; implementação React/Tauri; motor de vídeo;
  efeitos 3D para "preencher espaço".
