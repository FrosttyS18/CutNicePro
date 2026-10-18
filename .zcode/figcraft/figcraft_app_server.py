"""Servidor MCP `figcraft-app` do CutNicePro — attached com auto-recuperacao.

Estrategia (nunca quebra o startup do ZCode):
  1. Porta 7979 escutando -> executa figcraft-cli mcp --attach 7979 (attached).
  2. Marker design/FIGCRAFT-ATTACHED.on presente -> abre o app com --control 7979
     (processo destacado), aguarda a porta (ate 30 s) e anexa.
  3. Caso contrario -> fallback HEADLESS com aviso no stderr (o backend vigente pode
     ser conferido com a ferramenta inspect_ui do servidor).

Ativar o attached: manter/criar o marker. Desativar: remover o marker (e fechar o app).
Detalhes e runbook: docs/FIGCRAFT-ATTACHED.md.
"""
import os
import socket
import subprocess
import sys
import time

ROOT = r"C:\CutNicePro"
APP = r"C:\Program Files\FigCraft\figcraft.exe"
CLI = r"C:\Program Files\FigCraft\figcraft-cli.exe"
PORT = 7979
MARKER = os.path.join(ROOT, "design", "FIGCRAFT-ATTACHED.on")


def port_up(timeout=1.0):
    try:
        with socket.create_connection(("127.0.0.1", PORT), timeout=timeout):
            return True
    except OSError:
        return False


def run_cli(*args):
    # Popen com lista de argumentos lida corretamente com espaços no caminho
    # (os.execv no Windows re-parseia a linha e quebra "Program Files").
    # Sem redirecionamento, o filho herda stdin/stdout desta sessão: passthrough MCP.
    proc = subprocess.Popen([CLI, *args])
    sys.exit(proc.wait())


def main():
    if not port_up() and os.path.isfile(MARKER) and os.path.isfile(APP):
        detached = 0x00000008 | 0x00000200  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(
            [APP, "--control", str(PORT)],
            creationflags=detached,
            close_fds=True,
            cwd=os.path.dirname(APP),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline and not port_up():
            time.sleep(1)

    if port_up():
        run_cli("mcp", "--attach", str(PORT))
    else:
        sys.stderr.write(
            "figcraft-app: canal %d indisponivel (app fechado e marker ausente) — "
            "seguindo em modo HEADLESS. Para ativar o attached: criar %s e reabrir a sessao.\n"
            % (PORT, MARKER)
        )
        sys.stderr.flush()
        run_cli("mcp")


if __name__ == "__main__":
    main()
