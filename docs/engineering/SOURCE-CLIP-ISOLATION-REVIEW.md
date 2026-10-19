# Revisão 03L — 2026-10-19

FUNCTIONAL STATUS: PARTIAL. REGRESSION STATUS: PASS no escopo dos testes. VISUAL STATUS: PENDING HUMAN APPROVAL.

Nota 03N: resultados abaixo pertencem à 03L e ficam preservados. Persistência do formato/isolamento não aprovou o preenchimento do quadro; contain gera faixas no 9:16 conforme relato posterior do mantenedor. Citações conferidas e uma amostra analisada não aprovaram a linguagem/interpretação em todos os clipes; o resumo técnico atual foi rejeitado e precisa correção. Retirada de Large completo em favor do Turbo está decidida, ainda pendente no código. Referência vigente: ENGINE-HANDOFF.md e prioridades do BACKLOG.

## Implementação

- `VideoPreview original` usa dimensões da mídia, contain, áudio original e não mostra texto/legendas editadas. ProjectOverview usa esse modo.
- `clip-workspace` separa configurações do vídeo completo e mapa por corte, captura as edições e restaura o vídeo completo. Persistência valida os novos campos opcionais, sem invalidar workspaces anteriores válidos.
- Formato de geração é salvo no corte. Seu ID inclui o formato para impedir reaplicação de edições de uma geração anterior com outra proporção. Legado sem formato usa a proporção suportada mais próxima da mídia e ajuste sem crop.
- Galeria, inspeção e abertura no editor usam configurações isoladas do corte. Miniaturas conservam aspect ratio sem teto de altura conflitante. O tamanho da fonte em prévias verticais usa a largura de saída de 1080 px, como a exportação.
- Seletor de modelo compacto, dropdown personalizado e opções de processamento recolhidas. Foco do seletor de formato restrito à modalidade teclado.
- Transcrição da inspeção usa parágrafos, espaço fora dos botões, tempos reais e rolagem limitada. Análise e transcrição têm controles separados.
- Análise local do texto com llama.cpp/Qwen3-4B Q4_K_M. Geração e análise de cortes existentes usam o mesmo gate e processo cancelável. Não executa ASR nem análise de imagens. Não envia dados externos.
- JSON restringido por esquema; três critérios editoriais com citações conferidas literalmente no trecho. Nota agregada: 40% gancho, 30% desenvolvimento, 30% fechamento. Não é previsão de viralização. Alterar a transcrição invalida análise e aprovação; erro não publica resultado parcial.

## Verificação

145 testes frontend aprovados; 82 testes Rust da suíte geral aprovados; análise local real aprovada em execução explícita; contrato sobre seis saídas ASR reais aprovado em execução explícita. Total: 229 casos únicos aprovados. O benchmark antigo de 30 s não foi reexecutado nesta tarefa. Build Vite/TypeScript e compilação Rust aprovados. Aviso preexistente de bundle acima de 500 kB permanece.

Um corte real de 53,6 s foi analisado com o processo nativo e validado contra sua fala. O resultado distinguiu itens do PUBG de problemas no PC, sem misturar os objetos, e explicou a ausência de solução final. O modelo foi executado em CPU com até oito threads; a execução Rust aprovada levou 49,13 s incluindo o teste. O arquivo do modelo ocupa 2.497.280.256 bytes; pico de memória não foi medido. Modelo de texto não é Qwen3-ASR.

Falha inicial corrigida: `--log-disable` também suprimia a saída de geração na distribuição usada; removido. Uma execução intermediária confundiu dois assuntos; instrução de mudanças de tema foi refinada e a repetição real passou. Isso não garante ausência de interpretações erradas em outros clipes.

ASR: seis configurações válidas de 86 s, mais uma falha UTF-8 recuperada por repetição apenas do caso afetado. As frases confirmadas ainda contêm erros. Nenhum prompt experimental adotado. Detalhes: `docs/references/ASR-REFINEMENT-2026-10-19.md`.

## Revisão de código de interface

Skill web-design-guidelines, consulta atual em 2026-10-19; somente semântica, acessibilidade e contratos, sem auditoria estética autônoma:

- `TranscriptionSetup.tsx:14`: rótulo explícito do modelo e checkbox nomeado; controles personalizados existentes reutilizados.
- `ClipFormatPicker.tsx:5`: fieldset/legend, quatro radios nomeados, hit target compartilhado e foco de teclado.
- `ClipDetails.tsx:12`: hierarquia de títulos, estados de carregamento/erro e ações semânticas.
- `ClipTranscript.tsx:7`: palavras acionáveis por button; palavras sem alinhamento permanecem texto, sem tempos inventados.
- `clip-library.css`: rolagem interna, flex/grid com min-width e conteúdo longo contido; nenhum novo efeito contínuo.

Diretrizes: https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

FigCraft/Graphify não expostos na sessão; ausência de refactor guard na busca local. Análise estrutural feita no código, com skills de frontend, UX writing e implementação incremental. Nenhuma nova identidade visual aprovada ou ferramenta substituída.

## Limites e pendências

Aplicativo/navegador não abertos nem automatizados; sem alegação de console limpo ou fluxo Tauri completo. Aprovação de aparência e interações finais pelo mantenedor. O runtime/modelo textual foi instalado apenas nas ferramentas locais ignoradas; distribuição instalável continua pendente, como os motores locais anteriores. Configurações por corte estão no workspace local; a coleção nativa persiste formato, análise, revisão e intervalos. Perda do armazenamento local perde ajustes finos do editor, preservando os metadados nativos do corte. Recuperar configurações históricas já sobrescritas pelo defeito anterior não é possível automaticamente.

Não houve commits, push, deploy, alteração da mídia original ou substituição da transcrição salva. Dados do app foram somente lidos/copiados para fixtures locais de teste; nenhuma gravação de projeto foi feita pelas ferramentas desta tarefa.
