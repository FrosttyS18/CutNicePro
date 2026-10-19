# FigCraft — Modo Attached (app conectado)

Estado: **VALIDADO em 2026-10-17** (operações reais de ponta a ponta contra o app desktop)
e **registrado no workspace com auto-recuperacao** — carrega no próximo reinício do ZCode.
O servidor headless (`figcraft`) permanece registrado e inalterado.

## Como funciona agora

O servidor `figcraft-app` do `.zcode/config.json` invoca o wrapper
`.zcode/figcraft/figcraft_app_server.py` (Python do sistema, stdlib), que nunca deixa o
startup do ZCode quebrado:

1. Porta 7979 escutando → `figcraft-cli mcp --attach 7979` (attached ao app aberto).
2. Marker `design/FIGCRAFT-ATTACHED.on` presente e porta fechada → abre o FigCraft com
   `--control 7979` (processo destacado), aguarda até 30 s e anexa.
3. Porta fechada e marker ausente → **fallback headless** com aviso no stderr (o backend
   vigente é consultável com `inspect_ui`).

### Ativar / desativar

- **Attached ativo (padrão atual):** marker `design/FIGCRAFT-ATTACHED.on` existe. Ao abrir
  o workspace, o FigCraft abre sozinho com canal de controle (se ainda não estiver aberto).
- **Desativar:** remover o marker (o servidor cai no fallback headless; nenhum startup
  quebra). Para remover também o servidor, apagar a entrada `figcraft-app` do
  `.zcode/config.json` e reiniciar o ZCode.
- **Conflitos:** nenhum — `figcraft` (headless) e `figcraft-app` são servidores distintos;
  com o marker ausente ambos rodam engines headless separadas (documentos independentes).

## Validação real (2026-10-17)

- App iniciado com `--control 7979`: porta LISTENING em 127.0.0.1 de propriedade do PID do
  próprio figcraft.exe (verificado via netstat/tasklist).
- Handshake attached: banner "attached to the FigCraft app at 127.0.0.1:7979" + 18
  ferramentas (mesmo conjunto do headless).
- `inspect_ui` attached retornou a janela real do desktop (`title: CutNicePro • – FigCraft`,
  `focused: true`) — informação que só o app em execução fornece.
- Operações reais em aba descartável (`file.new TESTE-MCP-ATTACHED`): criação de frame
  520x360 + texto "ATTACHED OK 7979", modificação (stroke ciano), leitura de retorno
  (`inspect_document` confirmou tudo), export PNG 1040x720 escrito PELO APP
  (`docs/reports/evidence/2026-10-17_figcraft-attached-test.png`, confirmado
  independentemente pelo subagente VISION) e descarte limpo (`file.close {force}` →
  documento do usuário de volta, intacto, com suas 2 imagens coladas).
- Wrapper validado ao vivo (handshake + `inspect_ui` através dele). Bug de `os.execv` com
  caminhos contendo espaços encontrado e corrigido via `subprocess.Popen` (argumentos em
  lista, stdio herdado).

## Limitações conhecidas (binário 0.6.0)

- Flags `--automation-read-root/--automation-write-root` (confinamento) documentadas no
  repo main, mas **inexistentes no 0.6.0** (CLI e app).
- FigCraft é **single-instance**: com o app já aberto SEM `--control`, lançar outra
  instância não cria processo novo nem abre a porta — é preciso fechar e reabrir com a
  flag (o wrapper cuida disso quando o app está fechado; marker presente).
- `screenshot {window}` exige a janela visível na tela; `screenshot` do documento funciona
  com o app minimizado.
- Chamadas attached não são reenviadas automaticamente após falha de transporte: o comando
  PODE ter sido aplicado antes da resposta perdida — inspecionar antes de repetir.
- Caminho de fallback do wrapper (porta fechada + marker ausente) validado por inspeção de
  código; disparo real ainda não observado (exige app fechado sem marker).

## Uso em sessões de design

### Reconexão realizada em 2026-10-19

O app estava aberto sem `--control`, portanto o cliente MCP não conseguia alcançar a porta 7979. Após o documento ser salvo e a instância anterior fechada, o FigCraft foi iniciado com `--control 7979` e o documento do projeto. Handshake attached e leitura dos frames 2262/2391/2440 foram efetivamente confirmados; evidências em `docs/reports/evidence/03c/`.

O cliente de leitura reproduzível é `node tools/figcraft-read.mjs <IDs>`; `--export <IDs>` salva exports na pasta de evidências. Ele não altera layers. O parser usa quebras LF, evitando que separadores Unicode presentes em nomes de layer quebrem o framing JSON-RPC.

Quando já existir uma instância sem controle, preservar e salvar o documento antes de fechar/reabrir. O wrapper não consegue habilitar uma porta numa instância iniciada sem a flag. Não encerrar a instância do usuário à força.

Com o attached carregado (após reinício), usar `figcraft-app` para criar/editar layouts que
o usuário acompanha ao vivo na tela, e `figcraft` (headless) para renderizações/exportações
determinísticas. Workflow oficial do projeto: ver AGENTS.md (Briefing → FigCraft → revisão
visual → implementação → screenshots → comparação → correções).
