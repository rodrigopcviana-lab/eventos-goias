"""Blacktag: /eventos lista o filtro de cidades (sem UF). O robô só entra nas
cidades que são municípios de Goiás e confirma pelo endereço da página do
evento (schema.org Event, "…, Cidade, GO"), porque nome de cidade se repete
entre estados. Hoje (nov/2026) a Blacktag não tem cidade de GO; a fonte fica
ligada para pegar quando aparecer, e custa um pedido por dia.
"""
import json
import re
import urllib.parse

from .comum import evento, iso_local, sem_acento

BASE = "https://blacktag.com.br"


def coleta(cfg, http, log, municipios_go=()):
    home = http.get(BASE + "/eventos")
    cidades = sorted({urllib.parse.unquote_plus(c) for c in re.findall(r'/eventos\?cidade=([^"&]+)', home)})
    alvo = {sem_acento(m) for m in municipios_go}
    escolhidas = [c for c in cidades if sem_acento(c) in alvo]
    out = []
    for cidade in escolhidas:
        lista = http.get(BASE + "/eventos?cidade=" + urllib.parse.quote_plus(cidade))
        for caminho in sorted(set(re.findall(r'href="(/eventos/\d+/[^"]+)"', lista))):
            pag = http.get(BASE + caminho)
            for bloco in re.findall(r'<script type="application/ld\+json">(.*?)</script>', pag, re.S):
                try:
                    d = json.loads(bloco)
                except ValueError:
                    continue
                if d.get("@type") != "Event":
                    continue
                loc = d.get("location") or {}
                end = loc.get("address") or ""
                partes = [p.strip() for p in end.split(",")]
                if len(partes) < 2 or partes[-1].upper() != "GO":
                    continue
                out.append(evento(
                    "Blacktag", caminho.split("/")[2], d.get("name"), iso_local(d.get("startDate")),
                    BASE + caminho, local=loc.get("name", ""), endereco=", ".join(partes[:2]),
                    bairro=partes[-3] if len(partes) >= 4 else "", cidade=partes[-2], uf="GO",
                ))
    log(f"  blacktag: {len(cidades)} cidades no filtro, {len(escolhidas)} de GO, {len(out)} eventos")
    return out
