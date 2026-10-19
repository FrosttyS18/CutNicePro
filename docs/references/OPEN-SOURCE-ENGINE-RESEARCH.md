# Referências open source para o motor do CutNicePro

Pesquisa em 2026-10-19 para continuidade com ZCode. Recomendação: manter React/Tauri/Rust e integrar capacidades pequenas por adaptadores. Preservar a UI do CutNicePro. Esta pesquisa não instala motores nem aprova incorporar código de terceiros.

## Situação atual e limite deste estudo — revisão 03N

A comparação original abaixo é pesquisa documental datada, não prova de que os fluxos dos aplicativos foram estudados de ponta a ponta ou adaptados. Houve leituras parciais e falhas de consulta já descritas em Fontes e limites. Não existe neste registro um mapeamento completo por revisão/arquivo/função que demonstre adoção de SupoClip, ViralMint, OpenClipper ou OpenCut. Não declarar essa adoção nem deduzir funcionamento apenas de README/estrelas.

Estado do nosso código após 03M: FFmpeg/ffprobe, whisper.cpp e Qwen3-4B textual já estão integrados por subprocessos; importação é persistente e render real existe. faster-whisper/Qwen3-ASR/Parakeet tiveram avaliações registradas, sem serem opções completas do pipeline do produto. As recomendações de “primeiro implementar transcrição/exportação” abaixo são históricas. A preferência atual por Turbo e retirada de Large completo consta na DEC-014; qualidade editorial e preenchimento 9:16 seguem defeitos abertos.

### Estudo obrigatório antes da próxima implementação

Usar os repositórios já listados, sem substituir a stack do CutNicePro. Para cada capacidade, registrar neste documento existente: URL e revisão efetivamente lida, caminhos/funções, contrato de entrada/saída, etapas/modelos, estados de erro/cancelamento/retomada, dependências/licenças, testes observados e adaptação escolhida. Explicar diferenças relevantes; não transpor uma infraestrutura de servidor/Docker para desktop por semelhança de tela. Falha de acesso é PENDING/BLOCKED, não evidência de comportamento. Esta tarefa documental não executa nem simula esse estudo técnico.

| Referência já indicada | Fluxos a estudar no código | Evidência de adaptação completa hoje |
|---|---|---|
| SupoClip | Seleção/contexto dos trechos, composição vertical e legendas | Não documentada; pendente |
| ViralMint | Encadeamento de etapas, jobs/falhas, timeline e render | Não documentada; pendente |
| OpenClipper | Contratos Tauri/Rust/React, ASR, enquadramento e exportação | Leitura anterior de Cargo.toml não comprova estudo desses fluxos |
| OpenCut / opencut-classic | Organização do editor, mídia e histórico | Não documentada; verificar a revisão adequada antes de adotar |

Esses focos são tarefas de investigação, não funcionalidades confirmadas por novo teste desses projetos. Manter as ressalvas de licença e as fontes históricas abaixo. Não atualizar estrelas/versões sem nova consulta, nem remover referências porque não foram usadas.

## Decisão proposta na pesquisa original — histórico

FFmpeg continua responsável por análise/transformação/render. Avaliar whisper.cpp como primeiro transcritor local e faster-whisper como alternativa medida, sem instalar ambos de início. Quando autorizada a importação real de links, integrar yt-dlp como etapa anterior ao mesmo armazenamento de mídia local. Aplicações completas servem para estudar contratos, jobs e experiência; não substituem automaticamente o projeto existente.

As estrelas abaixo são valores arredondados exibidos nas páginas consultadas, não medição de crescimento nem certificação de qualidade. Funcionalidades descritas são do código/documentação pública consultados; nenhum desses aplicativos foi instalado ou validado nesta pesquisa. Resultados de benchmarks dos autores não equivalem a desempenho na máquina do mantenedor.

## Aplicações completas para referência

| Repositório | Adoção observada / licença declarada | Contribuição para nosso projeto | Limite para adoção |
| --- | --- | --- | --- |
| [SupoClip](https://github.com/FujiwaraChoki/supoclip) | ~1,5 mil estrelas; AGPL-3.0 | Referência de seleção de momentos, enquadramento e legendas. | Setup rápido usa Docker e AssemblyAI; há documentação de modo local. Não adotar como motor local pronto sem avaliar esse caminho. |
| [ViralMint](https://github.com/openclaw-easy/ViralMint) | 167 estrelas; AGPL-3.0 | Referência de integração download → transcrição → timeline → export, incluindo FFmpeg/ASS e BYOK. | Plataforma ampla com FastAPI/React e vários serviços; reproduzir tudo ampliaria o escopo. Alegações de testes do README não foram executadas aqui. |
| [OpenClipper](https://github.com/GrepCut/OpenClipper) | 10 estrelas; MIT | Candidato mais próximo da stack: Tauri, React e Rust; documentação de ASR, enquadramento e export em Windows. Cargo.toml também consultado. | Pouca adoção pública. Proximidade técnica não comprova maturidade; estudar módulos e testes antes de reutilizar. |
| [OpenCut](https://github.com/OpenCut-app/OpenCut) | ~95,3 mil estrelas; MIT | Referência para editor, timeline e organização de mídia. | Main está em reescrita; o próprio projeto direciona o uso atual para [opencut-classic](https://github.com/OpenCut-app/opencut-classic). Não basear nosso motor num core em reconstrução. |

Minha avaliação: OpenClipper é o mais parecido com a arquitetura atual, enquanto SupoClip tem mais adoção que ele. Nenhum dos dois é automaticamente a melhor dependência para o MVP. Adoção de editor completo exigiria mudanças muito maiores que plugar transcrição e render.

## Motores e ferramentas especializados

| Repositório | Adoção observada / licença do repositório | Uso possível | Prioridade proposta |
| --- | --- | --- | --- |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | ~54,5 mil; MIT | Transcrição local em C/C++, executável separado e suporte a processamento CPU. | Primeira avaliação para M3; medir fala pt-BR e memória antes de fixar modelo. |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | ~26 mil; MIT | Transcrição com CTranslate2, CPU int8/GPU e timestamps. | Alternativa ao primeiro candidato; exige considerar distribuição do runtime Python e dependências. Não presumir vencedor por benchmarks diferentes. |
| [WhisperX](https://github.com/m-bain/whisperX) | ~24,7 mil; BSD-2-Clause | Alinhamento por palavra e identificação de falantes. | Depois da primeira transcrição; inclui dependências/modelos adicionais. Diarização tem condições próprias e não é requisito do primeiro ciclo. |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | ~199,3 mil; Unlicense no repositório | Obter mídia de link com metadados, progresso e integração posterior ao armazenamento local. | Quando a etapa YouTube for executada; considerar os requisitos de runtime JavaScript documentados e o build distribuído. |
| [Auto-Editor](https://github.com/WyattBlue/auto-editor) | ~5,6 mil; Unlicense | Cortes automáticos por análise, especialmente pausas/silêncio. | Posterior; não equivale a encontrar momentos semanticamente interessantes. |
| [PySceneDetect](https://github.com/Breakthrough/PySceneDetect) | ~5,3 mil; BSD-3-Clause | Detectar mudanças de cena e ajudar a evitar cortes visuais ruins. | Posterior; não identifica sozinho o valor de um trecho nem rastreia falantes. |

Sinais concretos de manutenção consultados: whisper.cpp releases com v1.9.5 marcada Latest, publicada em 6 de outubro; faster-whisper lista 1.2.1 como Latest; yt-dlp lista 2026.08.19; PySceneDetect documenta 0.7.2 em 11 de outubro de 2026. Não foi obtido histórico de crescimento de estrelas. API de commits do OpenClipper não respondeu nesta consulta, portanto não há conclusão sobre frequência recente de commits dele.

## Como avançar sem reiniciar o projeto — sequência histórica da pesquisa

1. Fechar a validação pendente das correções da entrada M2A, conforme orçamento autorizado. Diferenciar o erro do harness dos defeitos do produto.
2. Implementar uma transcrição local real de vídeo persistido, com adaptador isolado, idioma/timestamps, cancelamento, persistência e recuperação. Confirmar flags no executável selecionado, sem copiar exemplos incompatíveis de outros planos.
3. Exportar um trecho MP4 real com FFmpeg, inicialmente sem efeitos avançados; depois aplicar legendas ASS/SRT com os tempos da transcrição. Fonte, modelo e tempo do preview precisam corresponder ao arquivo exportado.
4. Integrar download real de YouTube via adaptador próprio, quando autorizado: URL → job → arquivo validado → armazenamento de mídia existente. Não usar iframe como prova de importação. Requer critérios para erros da origem, cancelamento e retomada/retry; sem automatizar credenciais do navegador.
5. Só então acrescentar seleção semântica de melhores momentos e reenquadramento. Auto-Editor e PySceneDetect resolvem partes diferentes desse problema; não representam um motor de viralidade pronto.

Aceite do primeiro ciclo: importar um arquivo, reiniciar/reabrir, transcrever fala em português, buscar e navegar na transcrição, escolher legendas e exportar um MP4 reproduzível. Um resultado real por fatia vale mais que instalar vários aplicativos de referência.

## Licença e procedência

SupoClip e ViralMint declaram AGPL-3.0; MIT/BSD/Unlicense também têm condições que precisam ser verificadas na versão escolhida. Não copiar código antes de registrar origem, versão/commit, licença e adequação à distribuição planejada. Conferir separadamente dependências, binários, modelos, fontes e outros assets. Não concluir compatibilidade comercial apenas pelo rótulo open source. A licença do repositório yt-dlp ou Auto-Editor não descreve sozinha todas as licenças dos executáveis empacotados.

## Fontes e limites

Fontes principais: links de cada linha da tabela, READMEs e páginas de releases oficiais. Consultado adicionalmente: [OpenClipper Cargo.toml](https://raw.githubusercontent.com/GrepCut/OpenClipper/master/src-tauri/Cargo.toml), [whisper.cpp releases](https://github.com/ggml-org/whisper.cpp/releases), [faster-whisper releases](https://github.com/SYSTRAN/faster-whisper/releases), [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases). Algumas leituras de arquivos individuais de SupoClip/ViralMint e API de commits falharam; avaliações desses casos permanecem documentais. Esta comparação não é auditoria de segurança nem teste de desempenho ou qualidade dos aplicativos.
