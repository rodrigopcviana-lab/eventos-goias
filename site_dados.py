"""Grava saida/eventos.json, o arquivo que o site lê (mesmo conteúdo da planilha)."""
import json
import os


def grava(caminho, historico, status, agora):
    eventos = []
    for chave, e in historico.items():
        eventos.append({
            "id": chave,
            "nome": e["nome"],
            "inicio": e.get("inicio") or "",
            "hora": bool(e.get("hora_conhecida")),
            "fim": e.get("fim") or "",
            "local": e.get("local", ""),
            "endereco": e.get("endereco", ""),
            "bairro": e.get("bairro", ""),
            "cidade": e.get("cidade", ""),
            "categoria": e.get("categoria", ""),
            "organizador": e.get("organizador", ""),
            "ticketeira": e["fonte"],
            "link": e["link"],
            "situacao": e.get("situacao", ""),
            "visto": (e.get("primeiro_visto") or "")[:10],
            # Última vez que o robô viu o evento no site da ticketeira (AAAA-MM-DDTHH:MM).
            "conferido": (e.get("ultimo_visto") or "")[:16],
        })
    eventos.sort(key=lambda x: (x["inicio"] or "9999", x["nome"].lower()))
    fontes = {nome: {"eventos": f.get("eventos", 0), "problema": f.get("erro") or f.get("aviso") or ""}
              for nome, f in status.get("fontes", {}).items()}
    coleta = {"inicio": (status.get("inicio") or agora.isoformat())[:16],
              "fim": (status.get("fim") or "")[:16], "paginas": status.get("pedidos", 0)}
    dados = {"atualizado": agora.isoformat(timespec="minutes"), "coleta": coleta,
             "fontes": fontes, "eventos": eventos}
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, caminho)
