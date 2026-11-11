"""Sympla: a página /eventos/<cidade>-go traz a lista embutida no HTML.

O site é Next.js e manda os dados no "flight" (`self.__next_f.push(...)`).
A busca é por raio a partir da cidade e pagina com `?page=N`; o bloco com
maior `total` é a lista completa, os outros são vitrines (festas, teatro,
fim de semana) que trazem o nome da categoria.
"""
import json
import math
import re

from .comum import evento, iso_local, objetos_json

BASE = "https://www.sympla.com.br/eventos/"


def _flight(html):
    partes = []
    for bloco in re.findall(r"self\.__next_f\.push\((\[.*?\])\)</script>", html, re.S):
        try:
            a = json.loads(bloco)
        except ValueError:
            continue
        if len(a) > 1 and isinstance(a[1], str):
            partes.append(a[1])
    return "".join(partes)


def _listas(html):
    """([(total, limite, [eventos])], {url: categoria}) de todas as listas da página."""
    s = _flight(html)
    out = []
    rotulos = {}
    for pos, obj in objetos_json(s, '{"data":['):
        dados = obj.get("data")
        if not isinstance(dados, list) or "total" not in obj:
            continue
        if dados and not (isinstance(dados[0], dict) and "start_date" in dados[0]):
            continue
        out.append((obj.get("total") or 0, obj.get("limit") or 0, dados))
        # Vitrine ("response" logo antes): o rótulo é o "label" da mesma seção.
        if s[max(0, pos - 12):pos].endswith('"response":'):
            ini = s.rfind('"label":"', 0, pos)
            if ini >= 0 and s.find('"response":', ini, pos - 11) < 0:
                rotulo = s[ini + 9:s.find('"', ini + 9)]
                # "Festas e shows em Goiânia" -> "Festas e shows"; vitrine de
                # data ("Aproveite o fim de semana") não é categoria.
                rotulo = re.sub(r"\s+em\s+[^,]+$", "", rotulo).strip()
                if "fim de semana" in rotulo.lower():
                    continue
                for e in dados:
                    rotulos.setdefault(e.get("url"), rotulo)
    return out, rotulos


def _converte(e, categoria):
    loc = e.get("location") or {}
    endereco = ", ".join(x for x in [loc.get("address"), loc.get("address_num")] if x)
    return evento(
        "Sympla", e.get("id"), e.get("name"), iso_local(e.get("start_date")), e.get("url"),
        fim=iso_local(e.get("end_date")),
        local=loc.get("name", ""), endereco=endereco, bairro=loc.get("neighborhood", ""),
        cidade=loc.get("city", ""), uf=loc.get("state", ""), categoria=categoria,
        organizador=(e.get("organizer") or {}).get("name", ""),
    )


def coleta(cfg, http, log):
    vistos = {}
    for polo in cfg.get("polos", []):
        paginas = 1
        pagina = 1
        while pagina <= paginas:
            url = BASE + polo + ("" if pagina == 1 else f"?page={pagina}")
            listas, rotulos = _listas(http.get(url))
            if not listas:
                log(f"  sympla {polo}: página {pagina} sem lista (layout mudou?)")
                break
            total, limite, _ = max(listas, key=lambda t: t[0])
            if pagina == 1 and limite:
                paginas = min(math.ceil(total / limite), cfg.get("max_paginas_por_polo", 40))
            for _, _, dados in listas:
                for e in dados:
                    loc = e.get("location") or {}
                    if (loc.get("state") or "").upper() != "GO":
                        continue
                    cat = rotulos.get(e.get("url"), "")
                    ja = vistos.get(e.get("id"))
                    if ja is None or (cat and not ja["categoria"]):
                        vistos[e.get("id")] = _converte(e, cat)
            pagina += 1
        log(f"  sympla {polo}: {paginas} página(s), {len(vistos)} eventos de GO acumulados")
    return list(vistos.values())
