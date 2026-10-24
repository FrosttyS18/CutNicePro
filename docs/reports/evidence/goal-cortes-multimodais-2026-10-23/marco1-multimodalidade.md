# MARCO 1 — Provas de multimodalidade no runtime local (2026-10-23)

## Ambiente
- OS: Windows 11 (26200) x64 | CPU: AMD Ryzen 7 5700X 8-core | RAM: 31,9 GB
- GPU: NVIDIA GeForce RTX 5070, 12.227 MiB total (9.362 MiB livres no início), driver 610.88, backend Vulkan
- Runtime: llama.cpp `llama-server` b11829 (commit 184f65360, release oficial win-vulkan-x64, MIT) —
  `.tooling/vendor/llamacpp-b11829/`. Motor anterior do app (b11729, `.tooling/vendor/analysis/gpu`)
  permanece INTACTO e em uso pelo caminho textual.
- Modelo: `gemma-4-12b-it-qat-q4_0.gguf` (sha 93567e57a8fe…, já usado pelo app, 6.652 MiB)
- Projector: `mmproj-gemma-4-12b-it-qat-q4_0.gguf` — OFICIAL, repo google/gemma-4-12B-it-qat-q4_0-gguf
  (Apache-2.0), 167 MiB, sha256 cb018338a7538a9814d994bfe54644c71eb7ed54e31eae2f721e45fd3c260da7
- Servidor: `llama-server -m <modelo> -mm <mmproj> -c 8192 -ngl 99 --host 127.0.0.1 --port 8731`
  → /props declara `"modalities": {"vision": true, "video": true, "audio": true}`
  → log: "loaded multimodal model" (14 s até pronto)

## Limitação descoberta (candidata 1 rejeitada com evidência)
`llama-mtmd-cli` crasha com fail-fast (0xC0000409) logo após init de áudio, com ou sem mídia,
nos builds b11729 (CPU e Vulkan) e b11829 — inclusive com `--no-mmproj-offload`. Diagnóstico
`llama-mtmd-debug -p encode --image rainbow` e `-p preproc --audio 440` PASSAM (exit 0, embeddings
reais) → o stack multimodal funciona; o defeito é do caminho interno do mtmd-cli. Solução adotada
(candidata 2): `llama-server` HTTP com o mesmo modelo+mmproj — sem crash, mesmo runtime oficial.

## Probes (payload real, detalhes NÃO descritos no prompt)
Arquivos: `probes/` (imagens PIL verificáveis, WAV de 16 kHz com 3 bipes 440/880/220 Hz).

| Probe | Entrada | Resultado | Veredito |
|---|---|---|---|
| A — imagem com detalhes | probeA.png via base64 data URL (/v1/chat) | "triângulo vermelho sup-esq; círculo azul grande inf-dir; estrela verde 5 pontas inf-esq; número 47 amarelo no centro" — TODOS corretos, nenhum no prompt | VISUAL PASS |
| Par controlado (sem imagem) | mesma pergunta, sem mídia | "Você ainda não anexou ou enviou nenhuma imagem" | controle PASS (par isola a causa) |
| B — imagem variada, texto igual | probeB.png | "GATO maiúsculo no topo; grande quadrado verde central; X preto inf-esq" — correto (fundo lido como cinza claro; era branco — erro menor) | VISUAL PASS |
| Sequência temporal | seq_f1.png + seq_f2.png em ordem | "a bola mudou de posição lateralmente; na 1ª está à esquerda, na 2ª à direita" — correto e na ordem | TEMPORAL PASS |
| Áudio — 3 bipes | probe_audio.wav via /completion audio_data + template canônico nothink (marker <__media…>) | "**três eventos sonoros** distintos; 1º alta frequência, 2º intermediário, 3º impacto profundo de baixa frequência" — contagem EXATA (não constava do prompt); 3º = mais grave CORRETO; ordem fina 440×880 trocada | ÁUDIO PASS com ressalva |

## Como desligar o thinking (necessário para resposta no content)
- `/v1/chat/completions` com `"reasoning_effort": "none"` → resposta no `content`, finish stop.
- Sem isso, o Gemma 4 gera bloco thought e estoura `max_tokens` com `content` vazio
  (evidência: probe inicial 76,6 s, finish=length, descrição correta presa no reasoning_content).
- Alternativa canônica (usada no probe de áudio): endpoint `/completion` com prompt raw
  `<|turn>system\n…<turn|\n<|turn>user\n<marker>…<turn|\n<|turn>model\n<|channel>thought\n<channel|>`
  (template do app, text_engine.rs prompt_gemma) + `audio_data` base64 + `stop: ["<turn|"]`.

## Tempos medidos (12B Q4_0, Vulkan, ~7,3 t/s geração)
- imagem+pergunta (chat, 300 tok máx): 15,8–25,4 s | par sem imagem: 41 s (thinking) | áudio 12,6 s
- Implicação de orçamento: análise de janelas de vídeo deve usar poucas imagens por chamada
  (1–3 frames), prompts curtos e paralelismo baixo; estimar antes de processar 24 min.

## Conclusão do marco
Entrada REAL de imagem e de áudio comprovada no runtime local com o artefato Gemma oficial
(mesmo modelo já usado pelo app + mmproj oficial). Falhas/limites registrados: crash do
mtmd-cli (3 builds testados), thinking precisa ser desligado explicitamente, áudio experimental
(ordem fina de pitch pode errar). Áudio como "entendimento sonoro" usará também eventos
estruturados (pausas/energia) além do LLM quando a precisão fina importar.
