# Entrada de mídia e ferramentas — implementação 03C

## Escopo autorizado

Solicitação de 2026-10-19: Home aprovada; seu CTA abre a tela de envio. Referência atual lida no MCP FigCraft attached, documento `CutNicePro Fase 01 - Propostas UI`, página `UI - designer`: frames 2262 (envio), 2440 (Legendas IA sem mídia) e 2391 (Legendas IA com mídia). A aprovação estética desta implementação continua com o mantenedor.

Jornadas: JRN-003/004/006/008/009; requisitos FR-003/004/005/006/007/008/011/012/013 e NFR-005. Regras aplicáveis: BR-001/006/007/012/022. Histórias US-004/007/011/013/017; AC-004/009/016/017 e contratos de edição correspondentes no backlog. A autorização desta tarefa cobre estas telas, sem aprovar globalmente as jornadas e hipóteses históricas.

## Contrato de interface

- Home > Criar Projeto abre `Meus Projetos > Enviar novo projeto`. `Enviar vídeo` é a seção ativa própria; Todos e Coleções não ficam marcados. O fluxo existente de criação de projeto vazio na biblioteca é preservado.
- Campo de link + Enviar: vazio abre seletor de arquivo; link válido pode ser aceito como referência do YouTube, sem download ou transcrição. Arquivo local válido pode ser selecionado ou solto e ganha prévia real no modal; cancelar não muda o vídeo atual. Conteúdo indecodificável recebe erro recuperável.
- Quatro ferramentas distintas: Editar vídeo, Converter longo para curto, Legendas IA e Reenquadrar IA. A repetição de Editar Vídeo no desenho não cria uma quinta funcionalidade.
- Legendas IA abre diálogo acessível com exemplos antes da mídia; após carregar, mostra vídeo, modelos de demonstração, proporção e a área Meus modelos com estado vazio. Fechar preserva a seleção enquanto a tela de envio estiver montada. Confirmar cria o projeto e transfere o acesso à mídia para a sessão do projeto; sair sem confirmar descarta a seleção temporária.
- Projetos recentes vêm da persistência existente, sem inventar cards, clipes ou datas. Loading, erro, repetição e vazio têm tratamento.

## Limites técnicos explícitos

### Ampliação autorizada em 2026-10-19

O mantenedor solicitou fechar primeiro as telas do fluxo inspirado no OpusClip, usando a identidade do CutNicePro: entrada → preparação → editor; projeto aparece na biblioteca e recentes; reabertura mostra vídeo, título editável, transcrição e ações laterais. Capturas do OpusClip são referências funcionais, não especificação de marca.

Projetos e renomeação usam persistência Rust existente; configurações de interface e transcrição de demonstração são guardadas por ID em armazenamento local da UI (versionado). Arquivos de vídeo não são copiados: ficam acessíveis na sessão via object URL; após reiniciar, a tela solicita reconexão do arquivo. Link YouTube é apenas referência validada; não há download/transcrição. Os motores Local/BYOK, importação persistente e render/export ficam para a próxima etapa.

O modal de preparação é explicitamente uma demonstração de interface, sem job/percentual de IA real. Texto demonstrativo é identificado e nunca passa por transcrição do vídeo. Editor oferece playback/seek/volume reais para arquivos locais, ajustes visuais e salvamento dessas configurações; não afirma renderização final.

Aceites ampliados: fonte aceita cria projeto real apenas após ação explícita; projeto aparece nos dois acessos; renomear persiste; reabrir recupera configurações; a mídia ausente pede reconexão; seleção de texto, proporção e timeline respondem; cancelar preparação não cria projeto. Validar com testes puros, Rust pertinente, build e uma rodada de navegador isolado com IPC simulado (no máximo uma repetição motivada).

### Histórico da primeira fatia (03C, anterior à ampliação)

No primeiro incremento, a entrada implementava apenas seleção e prévia, sem criação de projeto a partir da fonte. Esse limite foi substituído pela ampliação acima. Abrir a tela, por si só, continua sem criar projeto; a confirmação explícita cria os metadados no storage Rust existente.

A integração de importação YouTube, transcrição/tradução e renderização/exportação continua pendente. O editor agora permite explorar a prévia; links podem abrir o player incorporado da origem sem download. Exemplos e modelos nunca são apresentados como legendas produzidas para o arquivo. Sem dependências novas e sem mudança de stack.

## Contrato visual derivado

Shell existente preservado. FigCraft: input 731 × 63, botão 197 × 50, fundo #1E1E1E/r11; cards pretos/r16; diálogo 504 px de largura, fundo #09090B/r20; opções em superfície branca. Texto de apoio usa #929292; tamanhos mínimos legíveis substituem textos de 6–9 px da referência. Conteúdo responsivo, sem cortes de foco ou scroll bloqueado no modal.

## Validação planejada

- `npm run build` no app: TypeScript e bundle devem passar.
- `npm test`: contratos de arquivo/link/configuração e regressões existentes.
- Runtime headless isolado com IPC simulado: navegação, estados de mídia, diálogo, teclado, modelos/proporções, erros e layouts de 960/1280/1440 px. Não equivale a teste no executável Tauri.
- Uma rodada inicial e no máximo uma repetição motivada por falha. Sem auditoria estética; VISUAL STATUS: PENDING HUMAN APPROVAL.

## Evidência da entrega 03D

- `npm run build`: PASS; `cargo test --lib`: 15/15, incluindo renomeação e persistência.
- Testes novos de workspace + inspeção: 10/10; validações de arquivo/link e suítes prévias registradas nas etapas anteriores da mesma implementação.
- `tools/e2e/phase03d-project-flow.mjs`: 13 casos únicos PASS em Edge headless com IPC simulado. Oito casos aprovados na primeira execução foram retidos; os cinco restantes passaram após corrigir um seletor ambíguo do teste. Mídia real de teste gerada pelo FFmpeg existente; nenhuma IA executada. Evidências: `docs/reports/evidence/03d/`.
- Export/render e transcrição real não foram testados porque não estão implementados por escopo. Executável Tauri e janela nativa de seleção não foram auditados nesta entrega.
- Rascunhos independentes em `design/handoff/03d/flow-ui-v1.figcraft`: v1 DRAFT, três frames. Renders são documentação de design, não screenshots da aplicação nem aprovação estética.

## Estrutura e convenções

`app/src/components/upload/`: componentes pequenos; `app/src/hooks/useVideoSource.ts`: lifecycle da mídia; `app/src/lib/video-source.ts`: validação pura; `app/src/screens/UploadScreen.tsx`: composição. CSS isolado por prefixo e arquivo próprio, reaproveitando tokens existentes. Sem `any`, comentários de código ou novas dependências.

Exemplo de contrato: `type ToolId = "editor" | "clips" | "captions" | "reframe";`.

Limites: sempre validar entradas e liberar recursos; não implementar IA simulada, substituir bibliotecas ou gravar mídia sem contrato de persistência; mudanças futuras de motor/dependências exigem escopo técnico próprio.

## Correção 03E — fluxo e limites de viewport (2026-10-19)

A revisão do mantenedor rejeitou a preparação em etapas simuladas e o fluxo de projeto vazio da 03D. Contrato vigente: Novo projeto abre o envio; seleção geral aceita cria o projeto de vídeo e abre sua visão com player, título e painel de transcrição. Editar vídeo é uma ação posterior. Coleções organizam projetos; projetos não são pastas. Registros antigos sem mídia são preservados e identificados como legados.

O envio geral não abre o modal de ferramentas. O modal só aparece ao escolher expressamente uma ferramenta. A importação usa estado ocupado da operação existente, sem timer ou percentual artificial; falha permite tentar novamente. Sem motor, a transcrição fica vazia e identificada como pendente, sem texto inventado. A transcrição real e o download do YouTube continuam fora deste ajuste.

Layout: resumo limitado a 1120px; tamanho do player considera altura da janela e proporção. Editor desktop usa três áreas na altura disponível e timeline no rodapé. Apenas transcrição, inspector e timeline ampliada têm rolagens próprias; a página do editor não cresce com a largura ultrawide. Janelas estreitas ou baixas têm fluxo vertical acessível. Caneta adjacente ao título; seleção de texto liberada em campos e texto de transcrição, bloqueada na estrutura do app. Timeline com régua, cursor, zoom e 12 miniaturas reais extraídas da mídia local; sem waveform fictícia. Corte altera apenas prévia, não renderiza arquivo.

Referências oficiais consultadas: [Coleções](https://help.opus.pro/docs/article/collections), [Layouts](https://help.opus.pro/docs/article/apply-the-layouts), [Trim e extensão](https://help.opus.pro/docs/article/trim-extend-the-video), [Editor](https://www.opus.pro/ai-video-editor). A separação das etapas e controles foi interpretada para o fluxo solicitado; sem copiar identidade nem alegar reproduzir todos os recursos do OpusClip.

Rastreabilidade mantida: JRN-003/004/006/008/009 e FR-003/004/005/006/007/008/011/012/013 da seção anterior; correção dos aceites de importação, navegação e responsividade. Artefato ART-009 v1 anterior rejeitado nesta revisão; ajuste 03E v2 permanece PENDING HUMAN APPROVAL. Sem alteração da Home aprovada.

Validação planejada: build TypeScript/Vite; 30 unitários relacionados; runtime isolado com IPC simulado e mídia real, sem screenshots. Verificar fluxo, erro/retry, caneta, seleção, miniaturas/seek/zoom, reabertura e layouts 600–3440px. Uma rodada inicial e uma repetição apenas dos casos pendentes se houver falha. Teste no executável e aprovação visual pertencem à validação posterior do mantenedor.

Resultado da correção 03E: build PASS; 30 unitários PASS; 12 runtime únicos PASS com IPC simulado (7 iniciais e 5 pendentes após corrigir o teste de botão desabilitado). FigCraft MCP standalone respondeu e os frames 2262/2391/2440 foram relidos sem salvar o documento. Evidência em docs/reports/evidence/03e/. Sem teste no executável ou aprovação estética.

## Refinamento 03F — 2026-10-19

Legendas no editor abre modal de estilos com modelos0–9 e opção sem legenda. Escolha atualiza configuração; fechar retorna foco. Cursor da timeline usa haste e alça neutras; mouse não contorna o bloco inteiro, teclado mantém indicação no cursor. Sem alterar o fluxo aprovado de envio. Prévia dos presets é estática; motor e render continuam pendentes. Contrato e passagem para o ZCode: ../engineering/ENGINE-HANDOFF.md. JRN-006/008/009 e FR-007/008/011/012 mantêm a rastreabilidade anterior. Build e quatro casos runtime com IPC simulado PASS; visual PENDING HUMAN APPROVAL.
