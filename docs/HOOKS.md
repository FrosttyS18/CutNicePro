# CutNicePro — Hooks de Proteção

Autorizados explicitamente pelo usuário (2026-10-17) para o **escopo USER** do ZCode,
com scripts e regras mantidos **dentro do repositório**. Fora do workspace `C:\CutNicePro`
todos os hooks são no-op (identificação via `${ZCODE_PROJECT_DIR}`).

## O que está configurado e onde

**Configuração (escopo USER):** `C:\Users\adcka\.zcode\cli\config.json` → chave `hooks`
(`hooks.enabled: true`). Nada de hooks no `.zcode/config.json` do projeto (fonte única).

**Scripts e regras (repositório):** `.zcode/hooks/scripts/` e `.zcode/hooks/harness/`
(Python 3.12 do sistema, stdlib apenas). Log de auditoria: `.zcode/hooks/audit/audit-log.jsonl`
(gitignored).

| Evento | Matcher | Script | Efeito |
|---|---|---|---|
| `SessionStart` | (todos) | `session_start.py` | Registra início da sessão no log. Nunca bloqueia. |
| `PreToolUse` | `^Bash$` | `guard_destructive.py` | **Bloqueia (exit 2)** comandos destrutivos: `rm` com `-r`+`-f`, `git reset --hard`, `git push --force`/`-f`, `git clean -f/-d/-x`, `git checkout/restore .`, `rmdir/rd /s`, `del /f /s /q`, `Remove-Item -Recurse -Force`, `format x:`. Análise por segmento (`;|&`), então `grep "git reset --hard" doc` NÃO é bloqueado. Falha aberto em payload ilegível. |
| `PostToolUse` | `^(Edit\|Write\|ApplyPatch)$` | `validate_changes.py` | Validação leve do arquivo gravado: `.json` parseia, `.py` compila, `.js/.mjs/.cjs` passam por `node --check`, `SKILL.md` tem frontmatter com `name:`. Falha → registrado no log + feedback ao agente (`additionalContext`). Nunca desfaz nem bloqueia. |
| `Stop` | (todos) | `completion_audit.py` | Roda a baseline em **modo fast** (só checks estruturais; suítes de teste ficam SKIP) e registra o resultado com duração no log. **Exit 0 sempre** — nunca pede continuação (sem loops). |
| — | — | `harness/baseline_checks.py` | Baseline em dois níveis: `--fast` (estrutural: AGENTS.md, JSON do MCP, frontmatter das skills, compilação dos scripts — usado pelo Stop, timeout 90 s) e `--full` (padrão standalone; adiciona `npm test`/`pytest` quando existirem). **`--full` deve ser executado explicitamente antes de concluir implementações relevantes.** |

## Proteção contra regressões — estratégia em dois níveis

- **Fast (hook Stop, a cada resposta):** apenas checks estruturais (rápidos, limitados a
  90 s de timeout no hook), para auditar sem rodar suítes completas por resposta.
- **Full (explícita, antes de concluir implementações relevantes):**
  `python .zcode/hooks/harness/baseline_checks.py` — tudo do fast + `npm test`/`pytest`
  quando existirem. A cobertura não foi reduzida: as suítes apenas mudaram de momento.
- Validação da otimização (2026-10-17 21:10): fast PASS 4/0/2 (exit 0); full PASS 4/0/2
  (exit 0); negativo (projeto vazio) FAIL em `agents_md` (exit 1); Stop simulado com novo
  script exit 0, `mode: fast`, `duration_s` registrado (0,06 s).

## Resultados dos testes (2026-10-17, payloads simulados via stdin)

- guard_destructive: **8/8** — bloqueou `rm -rf`, `git push --force`, `git reset --hard`,
  `del /f /q` + `rmdir /s`; liberou comando benigno, `grep "git reset --hard"` (sem falso
  positivo), projeto estranho (`D:/OutroProjeto`, no-op) e stdin inválido (fail-open).
- validate_changes: **5/5** — JSON válido PASS silencioso; JSON quebrado FAIL +
  `additionalContext`; SKILL.md ok PASS; SKILL.md sem frontmatter FAIL; projeto estranho no-op.
- session_start: **2/2** — registra no workspace, no-op fora.
- completion_audit: **PASS** — rodou a baseline (4 PASS / 2 SKIP) e exit 0.
- Evidências no `audit-log.jsonl` (entradas com `session_id` `t`/`t-sess` são dos testes).
- Teste com **eventos reais**: PENDING RESTART — hooks de config carregam no início da sessão.

## Como desativar

- **Toggle na interface do ZCode** (Settings → hooks) — desativa globalmente; reative ao
  voltar a este projeto. É o método recomendado pelo usuário para trabalhar em outros projetos.
- Ou edite `C:\Users\adcka\.zcode\cli\config.json` → `"hooks": { "enabled": false, ... }`.
- Os hooks já são inertes fora de `C:\CutNicePro`; a desativação manual é uma camada extra.

## Políticas

- Sem loops: apenas `PreToolUse` bloqueia (exit 2); `Stop` nunca pede continuação.
- Sem testes pesados: validações são de sintaxe; baseline roda testes apenas quando existirem
  (timeout interno de 240 s por suíte; timeout do hook Stop: 300 s).
- Se um bloqueio for legítimo (operação destrutiva realmente necessária): usar comando mais
  restrito, ou pedir ao usuário para executar manualmente / desativar o toggle temporariamente.
