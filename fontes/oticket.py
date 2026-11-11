"""OTicket: a lista de eventos é montada no navegador (e o robots.txt fecha
/api/), mas o sitemap.xml lista cada evento e a página do evento traz cidade,
UF, local e horário no próprio HTML (Next.js).

Para não abrir ~120 páginas por dia, `dados/oticket_uf.json` guarda a UF de
cada evento já visto: evento de fora de GO não é reaberto; os de GO são
relidos todo dia (horário e local podem mudar).
"""
import json
import os
import re
from datetime import datetime, timedelta

from .comum import FUSO_GO, evento

BASE = "https://oticket.com.br"


def _dados_do_evento(html):
    """O objeto {"event":{...}} que o Next.js manda junto com a página."""
    partes = []
    for bloco in re.findall(r"self\.__next_f\.push\((\[.*?\])\)</script>", html, re.S):
        try:
            a = json.loads(bloco)
        except ValueError:
            continue
        if len(a) > 1 and isinstance(a[1], str):
            partes.append(a[1])
    s = "".join(partes)
    i = s.find('"initialData":{"event":{')
    if i < 0:
        return None
    try:
        obj, _ = json.JSONDecoder().raw_decode(s, i + len('"initialData":'))
    except ValueError:
        return None
    return obj.get("event")


def _quando(data, hora):
    """'2026-11-04T00:00:00.000Z' + '18:00:00' -> datetime em Goiás (a data vem à meia-noite UTC)."""
    if not data:
        return None, False
    try:
        dia = datetime.strptime(data[:10], "%Y-%m-%d")
    except ValueError:
        return None, False
    m = re.match(r"(\d{1,2}):(\d{2})", hora or "")
    if m:
        return dia.replace(hour=int(m.group(1)), minute=int(m.group(2)), tzinfo=FUSO_GO), True
    return dia.replace(tzinfo=FUSO_GO), False


def coleta(cfg, http, log, pasta_dados="dados"):
    cache_path = os.path.join(pasta_dados, "oticket_uf.json")
    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    except (FileNotFoundError, ValueError):
        cache = {}

    sitemap = http.get(BASE + "/sitemap.xml")
    caminhos = sorted(set(re.findall(r"<loc>https://oticket\.com\.br(/event/(\d+)/[^<]+)</loc>", sitemap)))
    hoje = datetime.now(FUSO_GO).date().isoformat()
    out, abertos = [], 0
    for caminho, id_ in caminhos:
        if id_ in cache and cache[id_] != "GO":
            continue
        abertos += 1
        try:
            e = _dados_do_evento(http.get(BASE + caminho))
        except RuntimeError as err:
            log(f"  oticket: {caminho} falhou ({err})")
            continue
        if not e:
            continue
        uf = (e.get("state") or "").upper()
        cache[id_] = uf
        if uf != "GO":
            continue
        if (e.get("end_date") or e.get("date") or "")[:10] < hoje:
            cache[id_] = "passado"  # não reabre amanhã
            continue
        inicio, hora_ok = _quando(e.get("date"), e.get("start_time"))
        fim, _ = _quando(e.get("end_date") or e.get("date"), e.get("end_time"))
        if inicio and fim and fim < inicio:  # termina de madrugada, no dia seguinte
            fim += timedelta(days=1)
        out.append(evento(
            "OTicket", id_, e.get("event_name"), inicio, BASE + caminho, fim=fim,
            local=e.get("place", ""), cidade=e.get("city", ""), uf="GO", hora_conhecida=hora_ok,
        ))

    os.makedirs(pasta_dados, exist_ok=True)
    with open(cache_path + ".tmp", "w", encoding="utf-8") as f:
        json.dump(cache, f)
    os.replace(cache_path + ".tmp", cache_path)
    log(f"  oticket: {len(caminhos)} eventos no sitemap, {abertos} páginas abertas, {len(out)} de GO")
    return out
