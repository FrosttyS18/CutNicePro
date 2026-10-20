# SupoClip — análise de UI/UX e edição por módulo (bench 2026-10-20)

Base: código real (frontend/src/components/editor/*, backend editor_service.py
522 L, editor_document.py 408 L) + comportamento observado no navegador na
sessão validada. Nada implementado aqui.

| Capacidade | Módulo (arquivo) | Auto/Manual | Comportamento observado | Oportunidade concreta p/ CutNicePro |
|---|---|---|---|---|
| Rascunho não destrutivo | editor_service.py + "Restore original" | automático | geração NUNCA sobrescrita; toda edição é draft; botão restaura | ADOTAR: separar "geração" de "rascunho editável" no modelo de dados do CNP (coleção imutável + draft) |
| Histórico undo/redo | use-editor.ts (99-120) | manual | pilha past/future 50 níveis; coalescimento de edições <700 ms por grupo ("caption-style") | ADOTAR: coalescer por grupo+tempo evita 1 entrada por tecla |
| Autosave contínuo | use-editor.ts save() | automático | fila serializada, status "All changes saved/Saving…", offline cache | ADOTAR (CNP salva só ao aprovar) |
| Edição de legenda por palavra | inspector.tsx (scriptWords, doc.words) | manual | cada palavra tem textbox; timestamps por palavra preservados | ADAPTAR: o CNP JÁ tem words na transcrição — expor edição por palavra no ClipInspection |
| Estilo de legenda | inspector.tsx caption() | manual | presets + cor texto/realce + posição arrastando na prévia + fontes com checagem de idioma | ADAPTAR (parcial): presets já existem como conceito no CNP; posição arrastável é nova |
| Enquadramento | inspector Framing | manual+auto | 9:16/1:1/original; Fill/Fit; arrastar vídeo na prévia ("captions stay in place"); MediaPipe face-crop na geração | PORTAR (futuro): face-crop 9:16 é o item pendente "Ajustar/Preencher" do CNP |
| Timeline com segmentos | timeline.tsx (splitSegment, reorder swap) | manual | dividir no playhead, mover/duplicar/remover segmentos, combinar 2 clipes num draft | PORTAR (futuro, decisão do mantenedor): montagem interna — hoje fora do escopo declarado do CNP |
| Exportação em 2º plano | export-panel.tsx + worker export_editor | automático | job ARQ sobrevive ao fechamento; presets tiktok/reels/shorts com bitrate fixo; progress | ADOTAR: export como job persistente (CNP já tem jobs; reaproveitar) |
| Sincronia prévia↔export | render_document re-executa o MESMO EditDocument | automático | export parte do documento (não da prévia) — 1080×1080 exportado bateu com o 1:1 da prévia | ADOTAR: fonte única de verdade documento→render |
| Ranking/lista | home-app + tasks page | automático | "Best first"/"Timeline"; "Top pick"; nota 0-100 visível | CNP já ordena por nota; "Top pick" + aba timeline são adições baratas |
| Combinação de clipes | rail "Tick two or more clips to combine" | manual | mescla 2 cortes num draft novo | avaliar depois da montagem interna |

Dependências-chave do editor: pydantic (EditDocument), arq (jobs), ffmpeg
libass (legendas queimadas), MediaPipe/OpenCV (face-crop na GERAÇÃO, não no
editor), Deno/yt-dlp apenas para YouTube (não usado no fluxo local).

Custo de porte estimado (judgment técnico, não compromisso): rascunho +
autosave + undo são os de melhor razão custo/benefício (≤ 2 fatias no CNP,
sem mexer no render); face-crop 9:16 e montagem por segmentos são maiores e
dependem de decisão do mantenedor.
