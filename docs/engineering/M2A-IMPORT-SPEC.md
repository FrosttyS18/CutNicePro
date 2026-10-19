# SPEC — M2A: Importação persistente + análise de mídia (Fatia 1)

Status: IMPLEMENTANDO (2026-10-19). Contratos: AGENTS.md ("Motor de funcionamento"),
ENGINE-HANDOFF.md (passos 2–3), ENGINE-DECISIONS.md (binário/estratégia), emenda
do mantenedor com 5 cuidados — cada um vira critério de aceite verificável (AC-R*).

## Fluxo

Seleção (dialog nativo → path OU drag-drop Tauri → path) → validação frontend
(extensão/tamanho) → `create_project` → `import_media(project_id, src_path)`:
job assíncrono com cópia em stream → integridade → publicação → link →
`analyze_media(media_id)` (ffprobe) → navegação ao overview com mídia persistida.
Falha/cancelamento: projeto preservado, causa+ação na UI, retry disponível.

## Sequência transacional (índice = única fonte da verdade)

1. Reserva: cria `media/files/<job_id>.part` (nunca o nome final).
2. Cópia+hash: chunks de 4 MB; SHA-256 **dos bytes escritos**; espaço livre
   verificado antes e durante; cancelamento via flag por job.
3. Integridade (AC-R3): bytes escritos == `stat` inicial da origem E re-stat da
   origem com size+mtime inalterados. Origem alterada durante a importação →
   aborto com causa específica, removendo APENAS o `.part`.
4. Publicação (dentro de Mutex global; AC-R2): `rename .part → <sha256>.<ext>`
   (se destino existe → deduplicação: descarta o novo corpo, reusa o existente);
   entrada adicionada ao `index.json` com `project_ids` contendo o projeto
   (escrita tmp→swap); `link` idempotente re-executável pelo frontend.
5. Análise: ffprobe `-show_format -show_streams` no arquivo publicado; resultado
   gravado na entrada (mesma serialização).

Recuperação por ponto de falha: falha antes do rename → `.part` removido (ou
órfão removido no reconcile). Falha entre rename e índice → arquivo final sem
entrada → **adotado** pelo reconcile (AC-R1), nunca apagado. Falha no índice →
idem. Falha do link do projeto → `link_media` re-chamado (idempotente).

## Reconcile na inicialização (AC-R1)

- Índice legível: (a) `.part` sem job vivo → remover (jobs não persistem entre
  reinícios → qualquer `.part` na inicialização é de job interrompido);
  (b) arquivo final sem entrada → ADOTAR (entrada criada com hash do nome +
  ffprobe quando disponível; sem project_ids); (c) entrada cujo arquivo físico
  sumiu → marcada `unavailable: true` (não removida).
- Índice corrompido/ilegível: **limpeza suspensa**; comandos de mídia retornam
  erro com causa; projetos/coleções continuam operando (stores separados).

## Exclusão (referências explícitas — AC-R4-design)

`remove_project_media(project_id)`: remove o id de `project_ids` em cada
entrada; entradas cuja lista esvazia → arquivo físico removido + entrada
retirada (mesma escrita atômica, mesmo Mutex). Sem contador separado.

## Critérios de aceite verificáveis (mapeados nos testes)

- **AC-R1** reconcile: adota final sem entrada (não apaga); remove `.part`
  órfão; suspende limpeza com índice corrompido. [cargo: reconcile_*; Tauri real]
- **AC-R2** serialização/recuperação: publicação/índice/exclusão sob Mutex;
  falhas entre passos recuperáveis (adoção/link idempotente). [cargo: publish_*]
- **AC-R3** integridade: bytes==stat inicial + hash dos bytes escritos +
  re-stat origem; origem mutada durante import → aborto com causa e `.part`
  limpo, original intacto. [cargo: import_mutated_origin / cancel / space]
- **AC-R4** drop real: eventos `tauri://drag-drop` entregam paths e importam
  de fato (limitação seria informada, não oculta). [Tauri real]
- **AC-R5** protocolo Windows: `http://cnplocal.localhost` com ACAO:* para
  canvas, Range/206 para seek, miniaturas legíveis via scheme; ffprobe com
  `-show_format -show_streams` explícito. [cargo: parse test; Tauri real]
- AC gerais: reabrir app → projeto reproduz sem reenviar; cancelar na UI sem
  lixo; mídia compartilhada por 2 projetos — excluir 1 mantém o outro; nada de
  percentuais inventados; evidências Tauri real rotuladas ≠ IPC simulado.

## Fora desta fatia

Transcrição, legendas, exportação, BYOK, YouTube, referência-por-caminho,
bundling, UI de exclusão de projeto (comando `remove_project_media` existe e é
testado; gatilho de UI é pendência registrada).

## Correção de interface pós-entrega (2026-10-19)

Nomes de arquivo devem tratar separadores Windows e POSIX; nome de projeto remove apenas extensão e limita a80 caracteres. Títulos legados em formato de caminho são normalizados somente para exibição, preferindo media.name; não regravar títulos ou mídia do usuário automaticamente. SourceForm valida links YouTube e informa importação ainda indisponível, sem criar projeto de referência como importação concluída. Referências antigas são preservadas e identificadas. Progresso e rejeição do callback de importação precisam chegar ao diálogo; erro deve permanecer visível até fechar/repetir. Drop em modal não deve também importar pelo formulário subjacente.

Evidências em docs/reports/evidence/m2a-fix/:17 Vitest e5 Rust PASS; cargo check --tests sem warnings; build PASS com aviso preexistente de bundle. Runtime com IPC simulado PARTIAL:2 casos PASS e falha do harness de caminho na etapa seguinte, sem aprovação do fluxo nativo completo. Importação real do YouTube continua fora de M2A.
