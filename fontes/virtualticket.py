"""Virtual Ticket: API pública de leitura, documentada para uso automatizado
(https://virtualticket.com.br/docs/api), sem chave. `?state=GO` filtra o estado;
o robô confere a UF de novo do lado de cá."""
import json

from .comum import evento, iso_local

API = "https://virtualticket.com.br/api/public/v1/events"


def coleta(cfg, http, log):
    out = []
    pagina, ultima = 1, 1
    while pagina <= ultima and pagina <= 20:
        d = json.loads(http.get(f"{API}?state=GO&per_page=50&page={pagina}"))
        ultima = (d.get("meta") or {}).get("last_page") or 1
        for e in d.get("data") or []:
            loc = e.get("location") or {}
            uf = (loc.get("state_abbr") or loc.get("state") or "").upper()
            if e.get("is_online") or e.get("is_closed") or uf != "GO":
                continue
            out.append(evento(
                "Virtual Ticket", e.get("id"), e.get("name"), iso_local(e.get("starts_at")), e.get("url"),
                fim=iso_local(e.get("ends_at")), local=loc.get("name", ""),
                endereco=loc.get("formatted_address", ""), cidade=loc.get("city", ""), uf="GO",
                organizador=(e.get("producer") or {}).get("name", "") if isinstance(e.get("producer"), dict) else "",
            ))
        pagina += 1
    log(f"  virtual ticket: {len(out)} eventos de GO")
    return out
