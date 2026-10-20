FLUXO REAL POR PERFIL — mesmo pipeline de produção (resolve+DP+semantic), mesmas propostas brutas

## Perfil A — instalado vendor (Qwen3 4B Instruct Awq) | template: vigente: think vazio + /no_think | 84s resolve + 53s análise | avaliação: 3486 tok in / 1345 tok out
- **[400.7s–455.8s] nota 78** — Crítica a práticas de venda de skins em jogos
  - ABRE: “Que porra é essa?”
  - FECHA: “Caralho.”
- **[224.5s–242.8s] nota 74** — Reação a invasão e crítica a comportamento
  - ABRE: “na cabeça, na parte de trás do personagem, né?”
  - FECHA: “Esses caras ficam invadindo aqui toda hora, mano, esses dois.”
- **[380.4s–397.8s] nota 68** — Crítica a conteúdo com armas juntas
  - ABRE: “É micro imagem também, né?”
  - FECHA: “Você vê que a EA, olha as armas juntadinhas ali, ó.”
  - contiguidade: gaps entre cortes [-231.3, 137.6] (0,0 = contíguos)

## Perfil B — instalado vendor (Qwen3 4B Instruct Awq) | template: oficial sem think e sem /no_think | 92s resolve + 56s análise | avaliação: 3466 tok in / 1542 tok out
- **[400.7s–455.8s] nota 78** — Crítica a práticas de venda de skins em jogos
  - ABRE: “Que porra é essa?”
  - FECHA: “Caralho.”
- **[193.6s–209.7s] nota 76** — Crítica a um processo mal resolvido
  - ABRE: “Era pra ser group therapy”
  - FECHA: “Independente da situação.”
- **[209.7s–226.7s] nota 72** — Crítica a detalhes visuais em cenas cinematográficas
  - ABRE: “É um erro, é.”
  - FECHA: “na cabeça, na parte de trás do personagem, né?”
  - contiguidade: gaps entre cortes [-262.2, 0.0] (0,0 = contíguos)  ← ATENÇÃO: cortes contíguos

## Perfil C — Qwen3-4B-Instruct-2507 (models/home-c) | template: oficial sem think e sem /no_think | 140s resolve + 65s análise | avaliação: 3466 tok in / 2510 tok out
- **[208.8s–224.5s] nota 71** — Crítica à exigência e impercepção de detalhes
  - ABRE: “Independente da situação.”
  - FECHA: “Ninguém vai parar para ficar olhando na nuca,”
- **[110.8s–200.4s] nota 56** — Skins estranhas no Battlefield 6 geram críticas
  - ABRE: “O que eu achei engraçado é que, assim,”
  - FECHA: “É o grupo do papi.”
- **[0.0s–88.7s] nota 55** — Problemas técnicos em jogo da EA
  - ABRE: “Bom, galera, antes da gente entrar no GTA, eu queria só trazer uma observação aqui, porque assim...”
  - FECHA: “no Playstation.”
  - contiguidade: gaps entre cortes ordenados: A tem par quase-contíguo (397,8→400,7 = 2,9s) (0,0 = contíguos)

## Leitura (associação × qualidade × diversidade × tempo)
- A: [(400.7, 455.8), (224.5, 242.8), (380.4, 397.8)]
- B: [(400.7, 455.8), (193.6, 209.7), (209.7, 226.7)]
- C: [(208.8, 224.5), (110.8, 200.4), (0.0, 88.7)]
- A==B intervalos? False | A==C? False
- notas finais (pós-análise semântica): A=[78, 74, 68] B=[78, 76, 72] C=[71, 56, 55]
## Variáveis declaradas
- MUDA entre perfis: modelo (a/b=instalado; c=2507) e template (a=/no_think+think; b/c=oficial sem think).
- CONSTANTE: mesmas propostas brutas, mesma transcrição, temp=0, DP sem poda, análise semântica pós-seleção SEMPRE no formato vigente A (variável controlada — declarada aqui e no código).
- Contiguidade exata: B contém par contíguo real de 0,02s (209,68→209,70) — dois IDs, um assunto contínuo.
