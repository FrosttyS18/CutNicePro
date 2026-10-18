# CutNicePro — Avisos de Terceiros (Third-Party Notices)

Conteúdos de terceiros incorporados a este repositório, com origem, licença e obrigações
atendidas. Histórico: primeira auditoria em 2026-10-17 classificou `vercel-labs/agent-skills`
como "sem licença" com base na API do GitHub (campo `license` nulo); **revalidação na mesma
data confirmou declaração MIT explícita no README da revisão exata instalada** (ver §5).

## 1. Skills — Leonxlnx/taste-skill (MIT)

- Origem: https://github.com/Leonxlnx/taste-skill — commit f624f37a8c650b9cc550253104925efe4c8de246
- Incorporado em `.zcode/skills/`: `design-taste-frontend` (com assets/library/references/scripts),
  `image-to-code`, `minimalist-ui`.
- Direitos: Copyright (c) 2026 Leonxlnx —Licença MIT (texto no apêndice A).
- Cópia verbatim, sem modificações.

## 2. Skills — addyosmani/agent-skills (MIT)

- Origem: https://github.com/addyosmani/agent-skills — commit aeac41d4d005999432bb7312f7ff06383a91d59d
- Incorporado em `.zcode/skills/`: using-agent-skills, spec-driven-development,
  planning-and-task-breakdown, incremental-implementation, test-driven-development,
  frontend-ui-engineering, source-driven-development, code-review-and-quality,
  security-and-hardening (com references/), documentation-and-adrs; checklists
  compartilhados em `.zcode/references/`.
- Direitos: Copyright (c) 2025 Addy Osmani — Licença MIT (apêndice A).
- Cópia verbatim, sem modificações.

## 3. Documentação — storytold/figcraft (Apache-2.0)

- Origem: https://github.com/storytold/figcraft — `docs/mcp.md` obtido de `main` em 2026-10-17.
- Incorporado em: `docs/references/figcraft-mcp.md`.
- Licença: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0 (texto integral
  disponível no endereço oficial).
- Atribuição: Copyright FigCraft / storytold. **Mudanças: nenhuma** (cópia verbatim para
  referência local). O upstream não publica arquivo NOTICE próprio.

## 4. Skill — Graphify-Labs/graphify (Apache-2.0)

- Origem: pacote PyPI `graphifyy` 0.9.92 — repositório https://github.com/Graphify-Labs/graphify.
- Incorporado em: `.zcode/skills/graphify/SKILL.md` (skill distribuída com o pacote).
- Licença: Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0.
- Atribuição: Copyright The Graphify authors. **Mudanças: nota curta de instalação local
  adicionada após o frontmatter** (caminho do executável no workspace); restante verbatim.

## 5. Skill — vercel-labs/agent-skills (MIT — REVALIDADO)

- Origem: https://github.com/vercel-labs/agent-skills — commit 063bee94c3f4df8453406c830b0a7df0f2860278
- Incorporado em: `.zcode/skills/web-design-guidelines/SKILL.md` (único arquivo do skill;
  frontmatter declara `author: vercel`, versão 1.0.0).
- **Declaração de licença:** README da revisão exata 063bee94, seção "## License" → `MIT`
  (linhas 237-239; verificada em 2026-10-17 via raw.githubusercontent.com e no clone local
  mantido em `.tooling/vendor` na mesma revisão). O repositório não possui arquivo LICENSE
  no raiz — motivo pelo qual a API do GitHub reporta `license: null`; a ausência de arquivo
  ≠ ausência de declaração.
- Direitos: Copyright (c) Vercel / vercel-labs (titular do repositório oficial; ano não
  declarado upstream) — Licença MIT (apêndice A).
- Escopo: a seção de licença do README cobre o conteúdo do repositório sem ressalvas;
  não há licença própria nem carve-out em `skills/web-design-guidelines/`.
- Obrigações MIT atendidas: aviso de copyright + permissão (texto integral distribuído no
  apêndice A deste arquivo, que acompanha a distribuição).
- Status: RESOLVIDO (a classificação anterior de "SEM LICENÇA" foi um erro de leitura da
  API; nenhum bloqueio de redistribuição permanece).

## Fonte tipográfica (referenciada, não incorporada)

- Poppins — Indian Type Foundry — SIL Open Font License 1.1. Nenhum arquivo de fonte é
  distribuído neste repositório; ver `docs/brand/BRAND-FOUNDATION.md`.

## Imagens

- Todos os PNGs em `docs/reports/evidence/` e `design/exports/` são produções originais
  geradas no FigCraft para este projeto (formas próprias; sem logos ou assets de terceiros).

---

## Apêndice A —Texto integral da Licença MIT

```
MIT License

Copyright (c) 2026 Leonxlnx (taste-skill)
Copyright (c) 2025 Addy Osmani (agent-skills)
Copyright (c) Vercel / vercel-labs, ano não declarado upstream (vercel-labs/agent-skills)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

(As linhas de copyright acima consolidam os titulares das três fontes MIT incorporadas;
cada seção identifica qual se aplica a qual conteúdo.)
