# Revisão de código e interface — 2026-10-19

Escopo: arquivos novos de cortes/render e controles de edição alterados nesta
tarefa. Sem auditoria estética, navegador, app ou screenshots. Não é WCAG
certificado nem aprovação visual.

Fonte consultada pela skill web-design-guidelines:
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
Sentence case segue a skill UX Writing local, que prevalece sobre Title Case
da referência externa. Navegação geral, identidade e Home ficam fora do escopo.

Achados corrigidos na revisão:

- ProcessingDialog.tsx — X habilitado com confirmação, retomada após erro de
  cancelamento e prevenção de solicitações duplicadas; ação específica por tarefa.
- transcription.css — animação com pausa explícita e prefers-reduced-motion;
  movimentos somente por transform/opacity; overscroll contido em diálogos.
- FloatingPanel.tsx/floating-panel.css — alternativa de teclado ao arraste,
  foco visível, limite da viewport e seleção preservada nos campos.
- ClipTools.tsx/ClipResults.tsx — nomes/labels, estado vazio/erro/ocupado,
  aprovação antes de exportar e nota identificada como potencial estimado.
- VideoPreview.tsx/usePlaybackShortcut.ts — clique devolve foco ao vídeo;
  Espaço não interfere com digitação e não é bloqueado por janela não modal.
- render/commands.rs/file_output.rs — cópia cancelável fora do lock de
  publicação; apenas a promoção final fica no lock; falha preserva destino.
- media_tools.rs — sem nome de usuário fixo, sem Playwright como motor,
  validação de hash/extensão de mídia e par completo FFmpeg/ffprobe.

Pendências reais: conferir geometria/contraste/ordem de foco/interações no app;
histórico de versões por corte, lote, detecção de rosto e análise semântica por
modelo não pertencem à implementação entregue. Encerramento forçado pode
deixar temporários próprios. Não há promessa de recuperação de job interrompido.

Dependências: Phosphor MIT adicionado, sem dependências transitivas próprias.
Audit retornou 6 alertas preexistentes no ferramental Vite/Vitest: 3 moderados,
1 alto e 2 críticos; Phosphor não aparece nos alertas. Não foi aplicado update
de major nem audit fix --force fora do escopo. Bundle grande do editor/3D
continua com warning; nenhum warning Rust na compilação desta tarefa.
