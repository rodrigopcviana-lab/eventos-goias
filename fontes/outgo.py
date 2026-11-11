"""Outgo: /eventos/GO é um app Angular que já manda a agenda do estado no HTML
(script `app-root-state`, JSON com aspas trocadas por &q;)."""
import re
import json

from .comum import evento, iso_local

BASE = "https://www.outgo.com.br"


def coleta(cfg, http, log):
    pagina = http.get(BASE + "/eventos/GO")
    m = re.search(r'<script id="app-root-state" type="application/json">(.*?)</script>', pagina, re.S)
    if not m:
        raise RuntimeError("Outgo: estado da página não encontrado (layout mudou?)")
    bruto = m.group(1)
    for a, b in (("&q;", '"'), ("&s;", "'"), ("&l;", "<"), ("&g;", ">"), ("&a;", "&")):
        bruto = bruto.replace(a, b)
    estado = json.loads(bruto)
    out = []
    for chave, blocos in estado.items():
        if not chave.startswith("agenda-eventos") or not isinstance(blocos, list):
            continue
        for bloco in blocos:
            for e in (bloco.get("events") or []) + (bloco.get("featuredEvents") or []):
                if e.get("cancelled") or not e.get("isPublic", True):
                    continue
                out.append(evento(
                    "Outgo", e.get("id"), e.get("name"), iso_local(e.get("startDate")),
                    f"{BASE}/{e.get('identificador')}", fim=iso_local(e.get("endDate")),
                    cidade=e.get("location", ""), uf="GO",
                ))
    unicos = {e["id"]: e for e in out}
    log(f"  outgo: {len(unicos)} eventos de GO")
    return list(unicos.values())
