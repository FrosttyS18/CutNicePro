# Integração experimental Gemma — execução real e comparação

Gerado por tools/integration_report.py a partir dos artefatos reais.

## Tempos medidos (caminho integrado)

- Descoberta do motor (config+modelo+probe GPU): 0.2 s
- Pipeline completo (janelas→seleção→avaliação→cenas→análise): 690.2 s

### Chamadas por etapa (logs do runtime)

| etapa | load ms | prompt tokens | prompt tok/s | gen tokens | gen tok/s |
|---|---|---|---|---|---|
| analysis-gpu | 4096.1 | 759 | 108.1 | 277 | 4.0 |
| evaluate-0-gpu | 4140.56 | 2094 | 103.4 | 560 | 3.4 |
| selection-0-gpu | 5761.96 | 4707 | 102.0 | 51 | 3.4 |
| selection-1-gpu | 5760.36 | 5075 | 101.9 | 153 | 3.4 |
| selection-2-gpu | 3481.31 | 2665 | 103.3 | 78 | 3.4 |

Soma dos carregamentos de modelo por chamada: 23.2 s (cada chamada é um processo novo; sem cache entre etapas)

## Cortes integrados vs experimento (perfil D, atualização 7)

| | início | fim | duração | nota | título (integrado) |
|---|---|---|---|---|---|
| integrado | 420.9 | 461.8 | 41.0 | 58 | Histórico e valorização de skins da Valve no mercado |
| integrado | 315.1 | 367.3 | 52.1 | 56 | Análise das armas e equipamentos do personagem John Leach |
| integrado | 488.4 | 533.4 | 45.0 | 42 | Discussão sobre ruído de máquina e impacto no computador durante live |
| experimento | 33.5 | 120.9 | 87.4 | 85 | (fora do app) |
| experimento | 129.7 | 219.6 | 89.9 | 88 | (fora do app) |
| experimento | 313.3 | 367.3 | 53.9 | 92 | (fora do app) |

Intervalos idênticos entre os dois caminhos: 0 de 3.

## Metadados técnicos persistidos

```json
{
 "backend": "experimentalGemma",
 "model": "gemma-4-12b-it-qat-q4_0.gguf",
 "template": "gemma4-canonical-nothink",
 "sampling": "temp 1.0, top_k 64, top_p 0.95, min_p 0, seed 42",
 "seed": 42
}
```
