#!/usr/bin/env python3
"""Robô de eventos de Goiás: varre as ticketeiras e mantém uma planilha.

Roda uma vez por dia (Agendador do Windows, ver README.md). A cada rodada:
  1. coleta os eventos de GO de cada ticketeira ligada no config.json;
  2. junta com o histórico em dados/eventos.json (marca "Novo hoje" e
     "Saiu do site");
  3. regrava saida/eventos_goias.xlsx (+ .csv) e saida/status.json.

Uso:
  python robo_eventos.py              # rodada completa
  python robo_eventos.py --rapido     # teste: 2 páginas por polo do Sympla
  python robo_eventos.py --so sympla  # só uma fonte
"""
import argparse
import json
import os
import sys
import time
import traceback
from datetime import datetime

from fontes import bilheteria_digital, blacktag, oticket, outgo, sympla, virtualticket
from fontes.comum import FUSO_GO, Http, categoria_pelo_nome
import planilha
import site_dados

RAIZ = os.path.dirname(os.path.abspath(__file__))
FONTES = {
    "sympla": ("Sympla", sympla),
    "bilheteria_digital": ("Bilheteria Digital", bilheteria_digital),
    "outgo": ("Outgo", outgo),
    "blacktag": ("Blacktag", blacktag),
    "oticket": ("OTicket", oticket),
    "virtualticket": ("Virtual Ticket", virtualticket),
}
IBGE_GO = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/52/municipios"


def caminho(*p):
    return os.path.join(RAIZ, *p)


def le_json(path, padrao):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return padrao


def grava_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


class Log:
    def __init__(self):
        os.makedirs(caminho("logs"), exist_ok=True)
        self.f = open(caminho("logs", "robo_eventos.log"), "a", encoding="utf-8")

    def __call__(self, msg):
        linha = f"{datetime.now(FUSO_GO):%Y-%m-%d %H:%M:%S} {msg}"
        self.f.write(linha + "\n")
        self.f.flush()
        try:
            print(linha)
        except (UnicodeEncodeError, OSError):  # pythonw não tem console
            pass


def municipios_go(cfg, http, log):
    """Nomes dos 246 municípios de GO (IBGE, guardado por 30 dias); reserva no config."""
    cache = le_json(caminho("dados", "municipios_go.json"), {})
    if cache.get("nomes") and time.time() - cache.get("baixado_em", 0) < 30 * 86400:
        return cache["nomes"]
    try:
        nomes = [m["nome"] for m in json.loads(http.get(IBGE_GO))]
        if len(nomes) > 200:
            grava_json(caminho("dados", "municipios_go.json"), {"baixado_em": time.time(), "nomes": nomes})
            return nomes
    except Exception as e:  # sem IBGE, segue com a lista do config
        log(f"  municípios: IBGE indisponível ({e}); usando a lista de reserva do config")
    return cache.get("nomes") or cfg.get("cidades_go_reserva", [])


def junta(historico, coletados, fontes_ok, agora, dias_atras):
    """Atualiza o histórico com a coleta do dia e devolve-o."""
    hoje = agora.date().isoformat()
    vistos = set()
    for e in coletados:
        k = f"{e['fonte']}|{e['id']}"
        vistos.add(k)
        antigo = historico.get(k)
        e["primeiro_visto"] = antigo["primeiro_visto"] if antigo else agora.isoformat()
        e["ultimo_visto"] = agora.isoformat()
        historico[k] = e
    limite = datetime.fromordinal(agora.date().toordinal() - dias_atras).date().isoformat()
    for k in list(historico):
        e = historico[k]
        termino = (e.get("fim") or e.get("inicio") or "")[:10]
        if termino and termino < limite:
            del historico[k]
            continue
        if k in vistos:
            e["situacao"] = "Novo hoje" if e["primeiro_visto"][:10] == hoje else "No site"
        elif e["fonte"] in fontes_ok:
            # A fonte rodou bem e o evento não veio: esgotou, saiu ou foi cancelado.
            e["situacao"] = "Saiu do site"
        elif e.get("situacao") == "Novo hoje" and e["primeiro_visto"][:10] != hoje:
            e["situacao"] = "No site"
    return historico


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rapido", action="store_true", help="teste curto (2 páginas por polo)")
    ap.add_argument("--so", choices=sorted(FONTES), help="rodar só uma fonte")
    args = ap.parse_args()

    log = Log()
    cfg = le_json(caminho("config.json"), None)
    if cfg is None:
        log("config.json não encontrado ou inválido")
        return 2
    http = Http(cfg.get("pausa_entre_paginas_seg", 1.5), cfg.get("timeout_seg", 30))
    agora = datetime.now(FUSO_GO)
    log(f"rodada iniciada{' (rápida)' if args.rapido else ''}")

    status_ant = le_json(caminho("saida", "status.json"), {}).get("fontes", {})
    status = {"inicio": agora.isoformat(), "fontes": {}}
    coletados, fontes_ok = [], set()
    for chave, (nome, mod) in FONTES.items():
        fcfg = dict(cfg.get("fontes", {}).get(chave, {}))
        if args.so and chave != args.so:
            continue
        if not fcfg.get("ligada", True):
            continue
        if args.rapido:
            fcfg["max_paginas_por_polo"] = 2
        t0 = time.time()
        try:
            if chave == "blacktag":
                eventos = mod.coleta(fcfg, http, log, municipios_go(cfg, http, log))
            elif chave == "oticket":
                eventos = mod.coleta(fcfg, http, log, caminho("dados"))
            else:
                eventos = mod.coleta(fcfg, http, log)
            eventos = [e for e in eventos if e["uf"] == "GO" and e["nome"]]
            for e in eventos:
                if not e["categoria"]:
                    e["categoria"] = categoria_pelo_nome(e["nome"])
            coletados += eventos
            fontes_ok.add(nome)
            st = {"eventos": len(eventos), "segundos": round(time.time() - t0)}
            antes = status_ant.get(nome, {}).get("eventos", 0)
            if antes >= 10 and len(eventos) < antes * 0.3 and not args.rapido:
                st["aviso"] = f"caiu de {antes} para {len(eventos)} eventos: o site pode ter mudado"
                log(f"  ATENÇÃO {nome}: {st['aviso']}")
            status["fontes"][nome] = st
        except Exception as e:
            log(f"  ERRO {nome}: {e}")
            log(traceback.format_exc(limit=3))
            status["fontes"][nome] = {"eventos": 0, "erro": str(e)[:300]}

    historico = le_json(caminho("dados", "eventos.json"), {})
    # Teste rápido lê só parte das páginas: não pode concluir que algo "saiu do site".
    historico = junta(historico, coletados, set() if args.rapido else fontes_ok, agora,
                      cfg.get("dias_para_tras_no_historico", 60))
    grava_json(caminho("dados", "eventos.json"), historico)

    status["fim"] = datetime.now(FUSO_GO).isoformat()
    status["pedidos"] = http.pedidos
    pasta = cfg.get("pasta_saida", "saida")
    pasta = pasta if os.path.isabs(pasta) else caminho(pasta)
    arquivo, n_futuros, n_novos = planilha.grava(
        os.path.join(pasta, cfg.get("nome_planilha", "eventos_goias.xlsx")), historico, status, agora)
    status.update({"planilha": arquivo, "eventos_futuros": n_futuros, "novos_hoje": n_novos,
                   "ok": bool(fontes_ok)})
    site_dados.grava(os.path.join(pasta, "eventos.json"), historico, status, agora)
    grava_json(caminho("saida", "status.json"), status)
    log(f"rodada concluída: {n_futuros} eventos futuros, {n_novos} novos hoje, "
        f"{http.pedidos} páginas lidas -> {arquivo}")
    return 0 if fontes_ok else 1


if __name__ == "__main__":
    sys.exit(main())
