# Editor 03I — IN REVIEW

Solicitação 2026-10-19: retirar avisos repetitivos/internos; scroll discreto; ações de projeto por contexto sem cobrir Novo; legendas com predefinições/fonte/efeitos reais; transporte e Espaço. Preservar ASR e estrutura de transcrição aprovados pelo mantenedor. JRN-003/006/009/011; FR-011/012/013/017; BR-005/020/025/026 e AC-015/edição existentes.

Contrato: botão direito e tecla Menu/Shift+F10 abrem menu ancorado ao card; setas/Home/End/Escape e foco de retorno; ações reais de cópia da mídia, coleção, export SRT/TXT e exclusão confirmada. Compartilhamento remoto não existe e não será exposto como se funcionasse. TXT/SRT vêm da transcrição salva; sem transcrição não aparecem. Novo permanece visível. Sem lixeira sobreposta.

Mantenedor respondeu à pergunta de compartilhamento: “isso a gente ver depois”. Compartilhamento adiado expressamente, sem botão sem ação nem instalação de hospedagem. O menu é aplicado em Projetos, Coleções e projetos recentes; em Coleções também remove o vínculo sem excluir o projeto.

Legendas: catálogo próprio com nomes úteis, abas Predefinições/Fonte/Efeitos, fontes locais/sistema, peso/tamanho/cor/decoração/contorno/sombra/fundo/destaque e posição. Estilos opcionais validados e persistidos com defaults para projetos antigos. Mesma apresentação nos samples e vídeo; legendas em grupos legíveis de palavras, efeitos vinculados a tempos existentes. Nenhuma promessa de export MP4 ainda ausente.

Fontes: Poppins já incluída; Arial, Georgia, Impact, Verdana e Courier New são famílias do sistema com fallback. Nenhum novo pacote, serviço ou download de fonte. Preferência visual inválida cai no estilo do preset sem descartar mídia/transcrição ou regravar automaticamente o dado original. Campo novo é opcional para manter compatibilidade.

Transporte: início/fim do intervalo editado, play/pause central, timecode; Espaço funciona no editor sem interferir em campos, botões, sliders ou diálogos. Controles nativos continuam na visão do projeto; no editor usa os próprios. Novo reconhecimento preserva edições antes de iniciar sem impor aviso técnico de salvamento.

Espaço também funciona quando o cursor da timeline está focado; inputs de zoom/volume e campos de texto preservam sua interação. Os botões de início/fim usam o intervalo editado, limitado à duração. Timecode com centésimos. O reconhecimento em si permanece inalterado após avaliação positiva do mantenedor.

Saída de arquivos: seletor nativo vinculado à janela principal, origem resolvida apenas no índice de mídia gerenciada com vínculo do projeto; cópia para destino escolhido sem renderizar efeitos. TXT/SRT leem o registro de transcrição persistido e validam mídia/duração. Escrita em temporário exclusivo, sincronização e rename; falha preserva destino anterior e limpa somente seu temporário. Bloqueio de destino na pasta interna do app. Sem plugin/dependência nova; Tauri dialog já instalado. Fonte: https://v2.tauri.app/plugin/dialog/ .

Removidos avisos permanentes de salvamento/conclusão no painel e diálogo de exportação demonstrativo sem consumidores. Estado de salvamento agora é reativo para o botão refletir edições pendentes mesmo sem mensagem de sucesso. Erros e estados de processamento necessários continuam visíveis. Não foi alterada a Home aprovada.

Validação em código: contratos de estilo/migração/persistência/cues, transporte/atalho, menu/foco, SRT/TXT e cópia segura. Build TypeScript/Rust. Sem testes de navegador ou controle do app, por instrução do mantenedor. Uma rodada e repetição apenas por impacto/falha. Aparência/fluxo PENDING HUMAN APPROVAL.
