#!/usr/bin/env python3
"""Mostra o site no seu computador, com os dados da última coleta do repositório.

Uso:
  python servir.py          # abre http://localhost:8000
  python servir.py 8080     # outra porta (o botão Atualizar só funciona na 8000)
  python servir.py --sem-navegador

Monta a pasta _site/ igual ao GitHub Actions (site/ + planilha), mas gera o
eventos.json a partir de dados/eventos.json e saida/status.json com o código
atual de site_dados.py. Assim, mudança no site ou no site_dados.py aparece sem
precisar rodar o robô (que visita as ticketeiras e regrava dados/ e saida/).
Não altera nada fora de _site/ (que está no .gitignore).

O botão Atualizar, em localhost, fala com o Worker de verdade: ele dispara uma
coleta real no GitHub (com a mesma trava de 30 minutos).
"""
import http.server
import json
import os
import shutil
import sys
import webbrowser
from datetime import datetime

import site_dados

RAIZ = os.path.dirname(os.path.abspath(__file__))


def monta():
    destino = os.path.join(RAIZ, "_site")
    shutil.rmtree(destino, ignore_errors=True)
    shutil.copytree(os.path.join(RAIZ, "site"), destino)
    for nome in ("eventos_goias.xlsx", "eventos_goias.csv"):
        origem = os.path.join(RAIZ, "saida", nome)
        if os.path.exists(origem):
            shutil.copy2(origem, destino)
    with open(os.path.join(RAIZ, "dados", "eventos.json"), encoding="utf-8") as f:
        historico = json.load(f)
    with open(os.path.join(RAIZ, "saida", "status.json"), encoding="utf-8") as f:
        status = json.load(f)
    site_dados.grava(os.path.join(destino, "eventos.json"), historico, status,
                     datetime.fromisoformat(status["inicio"]))
    return destino


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    porta = int(args[0]) if args else 8000
    pasta = monta()
    os.chdir(pasta)
    url = f"http://localhost:{porta}/"
    print(f"Site em {url}  (Ctrl+C para parar)")
    if "--sem-navegador" not in sys.argv:
        try:
            webbrowser.open(url)
        except Exception:
            pass
    http.server.ThreadingHTTPServer(("127.0.0.1", porta), http.server.SimpleHTTPRequestHandler).serve_forever()


if __name__ == "__main__":
    main()
