"""Bilheteria Digital: o botão "GO" da home carrega /GO/as/1 (HTML de cartões).

O cartão traz título, dia ("13 de Novembro", sem ano), "Cidade - GO" e o local.
A página do evento dá a hora ("Abertura dos portões : 20:00H") e o nome do
local no og:title; com `buscar_detalhe` o robô abre cada evento (poucos por dia).
"""
import html as html_mod
import re
from datetime import datetime

from .comum import FUSO_GO, evento, limpa

BASE = "https://www.bilheteriadigital.com"


def _mes(nome):
    n = nome.lower().replace("ç", "c")
    nomes = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho",
             "agosto", "setembro", "outubro", "novembro", "dezembro"]
    return nomes.index(n) + 1 if n in nomes else None


def _data(texto, hoje):
    """'13 de Novembro' -> date; o ano é o que deixa a data mais perto de hoje para frente."""
    m = re.search(r"(\d{1,2})\s+de\s+([A-Za-zçÇ]+)", texto or "")
    if not m:
        return None
    mes = _mes(m.group(2))
    if not mes:
        return None
    for ano in (hoje.year, hoje.year + 1):
        try:
            d = datetime(ano, mes, int(m.group(1)), tzinfo=FUSO_GO)
        except ValueError:
            return None
        if (d.date() - hoje.date()).days >= -45:
            return d
    return None


def _texto(bloco, classe):
    m = re.search(r'class="%s"[^>]*>(.*?)</' % re.escape(classe), bloco, re.S)
    return limpa(html_mod.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))) if m else ""


def coleta(cfg, http, log):
    hoje = datetime.now(FUSO_GO)
    pagina = http.get(BASE + "/GO/as/1")
    out = []
    for bloco in pagina.split('<li class="box-li-evento">')[1:]:
        href = re.search(r'<a href="(/[^"]+)"', bloco)
        if not href:
            continue
        cidade_uf = _texto(bloco, "cidade-box-evento")
        cidade, _, uf = cidade_uf.rpartition(" - ")
        if uf.strip().upper() != "GO":
            continue
        nome = _texto(bloco, "titulo-evento-thumb")
        dia = _data(_texto(bloco, "data-evento-thumb"), hoje)
        local = _texto(bloco, "local-box-evento")
        hora_ok = False
        if dia and cfg.get("buscar_detalhe", True):
            try:
                det = http.get(BASE + href.group(1))
                h = re.search(r"Abertura[^:]*:\s*(\d{1,2})[:h](\d{2})", det, re.I)
                if h:
                    dia = dia.replace(hour=int(h.group(1)), minute=int(h.group(2)))
                    hora_ok = True
                t = re.search(r'og:title" content="[^|]*\|\s*(.*?)"', det)
                if t and (not local or local.upper() == "A DEFINIR"):
                    # "NOME - LOCAL Cidade - GO" -> LOCAL
                    resto = html_mod.unescape(t.group(1))
                    resto = re.sub(r"\s*" + re.escape(cidade) + r"\s*-\s*GO\s*$", "", resto, flags=re.I)
                    if " - " in resto:
                        local = resto.rsplit(" - ", 1)[1]
            except RuntimeError as e:
                log(f"  bilheteria digital: detalhe de {href.group(1)} falhou ({e})")
        out.append(evento(
            "Bilheteria Digital", href.group(1).strip("/"), nome, dia, BASE + href.group(1),
            local=local, cidade=cidade, uf="GO", hora_conhecida=hora_ok,
        ))
    log(f"  bilheteria digital: {len(out)} eventos de GO")
    return out
