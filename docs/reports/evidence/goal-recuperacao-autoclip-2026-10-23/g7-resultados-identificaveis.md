# G7 — Resultados identificáveis na interface (2026-10-23)

## Contrato versionado (compatível)
- `Clip.created_at_ms: Option<u64>` (Rust, `createdAtMs` no TS) — ms-epoch
  da PRIMEIRA publicação do id; `serde(default, skip_serializing_if)`:
  **legados sem data não recebem timestamp inventado** (nunca aparecem
  como "Novo"). Setado em `generation::run` apenas quando o id é inédito
  (`known_ids`); **regenerar/editar/reanalisar NÃO altera a criação**
  (testes cobrem). `analyze_clip`/reanálise preservam o campo (não o tocam).

## Badge "Novo" (global e por projeto — mesma galeria)
- `isClipNew`/`markClipOpened` (clips.ts): visto de verdade = clicar
  **Ver clipe** (inspect) → persiste em `cnp.clipsOpened.v1` (localStorage);
  abrir/reabrir/editar/regenerar não ressuscita "Novo". Badge renderizado
  no canto do poster (`.clip-card__new`, sem contorno extra — pílula com a
  cor de acento).
- Testes (clip-freshness.test.ts, 6): novo→aberto→visto persistido;
  legado nunca novo; abrir um não marca outro; reanálise não vira novo.

## Tempo relativo + data exata
- `relativeTime(from, now)` — `now` injetável (não gera data nova dentro):
  "Agora" / "há N minuto(s)" / "há N hora(s)" / "há N dia(s)"; skew de
  relógio não fica negativo. Exibido no poster (`.clip-card__when`) com
  `title` = data/hora exata (toLocaleString) acessível por tooltip.
- Atualização: recalculado no render da lista (sem timer dedicado — a lista
  re-renderiza em reload da biblioteca).

## Última geração (identificação contextual)
- A criação por clipe permite ver de qual geração veio cada corte (tempo
  relativo agrupa visualmente); filtro dedicado da última geração fica como
  pendência de produto (não bloqueou a identificação pedida).

## Nomes de arquivo compreensíveis
- `export_video`: o diálogo agora sugere **"{projeto}-{título do corte
  (≤40 chars)}"** quando exporta um CLIP (antes era sempre "{projeto}-corte",
  gerando arquivos indistinguíveis); export de vídeo completo mantém o padrão
  antigo. Sanitização existente (`filename()`) preservada.

## Validação
- TS 233/233 (+6 novos), Rust 159/159, tsc/eslint OK, exe reconstruído.
- Persistência/compatibilidade: projetos antigos continuam abrindo (campo
  opcional; validação runtime no parseClips rejeita datas inválidas).
- VISUAL: PENDING HUMAN APPROVAL (badges/tempo visíveis na galeria do app).
