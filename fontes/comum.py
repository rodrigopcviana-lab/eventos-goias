"""Peças comuns às fontes: acesso à rede educado, decodificação e o formato do evento."""
import http.client
import json
import re
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

# Goiás é UTC-3 o ano todo (sem horário de verão). Fuso fixo evita depender do
# pacote tzdata, que o Python do Windows não traz.
FUSO_GO = timezone(timedelta(hours=-3))

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


class Http:
    """GET com pausa entre pedidos e duas novas tentativas em falha de rede.

    A pausa é por site: o robô nunca dispara pedidos em rajada contra a mesma
    ticketeira. Não tenta passar por verificação anti-robô: 403/429 vira erro.
    """

    def __init__(self, pausa=1.5, timeout=30):
        self.pausa = pausa
        self.timeout = timeout
        self._ultimo = {}
        self.pedidos = 0

    def get(self, url):
        host = url.split("/")[2]
        espera = self.pausa - (time.time() - self._ultimo.get(host, 0))
        if espera > 0:
            time.sleep(espera)
        req = urllib.request.Request(url, headers={
            "User-Agent": UA,
            "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
        })
        erro = None
        for tentativa in range(3):
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    self._ultimo[host] = time.time()
                    self.pedidos += 1
                    return r.read().decode("utf-8", errors="replace")
            except urllib.error.HTTPError as e:
                self._ultimo[host] = time.time()
                if e.code in (403, 404, 429):
                    raise RuntimeError(f"HTTP {e.code} em {url}") from None
                erro = e
            except (OSError, http.client.HTTPException) as e:  # rede, timeout, conexão cortada
                erro = e
            time.sleep(2 * (2 ** tentativa))
        raise RuntimeError(f"falha de rede em {url}: {erro}")


def sem_acento(s):
    s = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in s if not unicodedata.combining(c)).lower().strip()


def limpa(s):
    return re.sub(r"\s+", " ", s or "").strip()


def iso_local(texto):
    """'2026-11-29T01:00:00+00:00' -> datetime em horário de Goiás (ou None)."""
    if not texto:
        return None
    try:
        d = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=FUSO_GO)
    return d.astimezone(FUSO_GO)


def evento(fonte, id_, nome, inicio, link, *, fim=None, local="", endereco="",
           bairro="", cidade="", uf="GO", categoria="", organizador="", hora_conhecida=True):
    return {
        "fonte": fonte,
        "id": str(id_),
        "nome": limpa(nome),
        "inicio": inicio.isoformat() if inicio else "",
        "hora_conhecida": bool(hora_conhecida and inicio),
        "fim": fim.isoformat() if fim else "",
        "local": limpa(local),
        "endereco": limpa(endereco),
        "bairro": limpa(bairro),
        "cidade": limpa(cidade),
        "uf": (uf or "").upper(),
        "categoria": limpa(categoria),
        "organizador": limpa(organizador),
        "link": link,
    }


def objetos_json(texto, marcador):
    """[(posição, objeto)] de cada objeto JSON que começa onde `marcador` aparece."""
    dec = json.JSONDecoder()
    achados = []
    i = texto.find(marcador)
    while i >= 0:
        try:
            obj, _ = dec.raw_decode(texto, i)
            achados.append((i, obj))
        except ValueError:
            pass
        i = texto.find(marcador, i + 1)
    return achados


# Categoria deduzida pelo nome quando a ticketeira não informa. A ordem importa:
# a primeira que casar vence ("Workshop de drinks" é curso, não gastronomia).
CATEGORIAS_PELO_NOME = [
    ("Religioso", r"\b(culto|igreja|louvor|retiro|gospel|missa|congresso de jovens)"),
    ("Cursos e workshops", r"\b(curso|workshop|palestra|treinamento|imers[aã]o|congresso|semin[aá]rio|"
                           r"mentoria|aula|capacita|forma[cç][aã]o|masterclass|confer[eê]ncia|simp[oó]sio|f[oó]rum)"),
    ("Teatro e stand up", r"\b(teatro|stand ?up|com[eé]dia|espet[aá]culo|musical|pe[cç]a|humor|bal[eé]|dan[cç]a)"),
    ("Infantil", r"\b(infantil|kids|crian[cç]a|baby)"),
    ("Esporte", r"\b(corrida|run\b|maratona|campeonato|torneio|copa\b|beach tennis|pedal|ciclismo|trail|jiu|futebol|v[oô]lei)"),
    ("Gastronomia e bebidas", r"\b(degusta|vinho|cerveja|gastr[oô]|food|jantar|chopp|drinks?|churrasco|feijoada|caf[eé]\b|whisky|gin\b)"),
    ("Festas e shows", r"\b(show|festa|festival|baile|open bar|rock|samba|sertanejo|pagode|dj\b|tour|turn[eê]|"
                       r"funk|trap|eletr[oô]nica|forr[oó]|r[eé]veillon|carnaval|party|fest\b|ao vivo|tributo|cover)"),
]


def categoria_pelo_nome(nome):
    n = (nome or "").lower()
    for cat, padrao in CATEGORIAS_PELO_NOME:
        if re.search(padrao, n):
            return cat
    return ""
