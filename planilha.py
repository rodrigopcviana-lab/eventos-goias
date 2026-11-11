"""Monta a planilha Excel a partir do histórico (dados/eventos.json)."""
import csv
import os
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]

COLUNAS = [
    ("Data", 11), ("Até", 11), ("Dia", 6), ("Hora", 7), ("Evento", 48), ("Local", 30),
    ("Bairro", 20), ("Cidade", 20), ("Categoria", 22), ("Organizador", 26),
    ("Ticketeira", 18), ("Link", 14), ("Situação", 16), ("Visto pela 1ª vez", 14),
]

AZUL = PatternFill("solid", fgColor="1F3A5F")
NOVO = PatternFill("solid", fgColor="E3F1E3")
SUMIU = PatternFill("solid", fgColor="F4F4F4")


def _linha(e):
    ini = datetime.fromisoformat(e["inicio"]) if e.get("inicio") else None
    fim = datetime.fromisoformat(e["fim"]) if e.get("fim") else None
    # "Até" só para evento de mais de um dia (festa que vira a madrugada não conta).
    ate = fim.date() if ini and fim and (fim - ini).total_seconds() > 20 * 3600 else None
    return [
        ini.date() if ini else None,
        ate,
        DIAS[ini.weekday()] if ini else "",
        ini.strftime("%H:%M") if ini and e.get("hora_conhecida") else "",
        e["nome"], e.get("local", ""), e.get("bairro", ""), e.get("cidade", ""),
        e.get("categoria", ""), e.get("organizador", ""), e["fonte"], e["link"],
        e.get("situacao", ""), datetime.fromisoformat(e["primeiro_visto"]).date(),
    ]


def _aba(wb, titulo, eventos, primeira=False):
    ws = wb.active if primeira else wb.create_sheet()
    ws.title = titulo
    ws.append([c for c, _ in COLUNAS])
    for i, (_, larg) in enumerate(COLUNAS, 1):
        ws.column_dimensions[get_column_letter(i)].width = larg
        cel = ws.cell(row=1, column=i)
        cel.font = Font(bold=True, color="FFFFFF")
        cel.fill = AZUL
        cel.alignment = Alignment(vertical="center")
    col_link = [c for c, _ in COLUNAS].index("Link") + 1
    for e in eventos:
        ws.append(_linha(e))
        r = ws.max_row
        ws.cell(row=r, column=1).number_format = "DD/MM/YYYY"
        ws.cell(row=r, column=2).number_format = "DD/MM/YYYY"
        ws.cell(row=r, column=len(COLUNAS)).number_format = "DD/MM/YYYY"
        link = ws.cell(row=r, column=col_link)
        link.value = "abrir"
        link.hyperlink = e["link"]
        link.font = Font(color="1F5FBF", underline="single")
        if e.get("situacao") == "Novo hoje":
            for c in range(1, len(COLUNAS) + 1):
                ws.cell(row=r, column=c).fill = NOVO
        elif e.get("situacao") == "Saiu do site":
            for c in range(1, len(COLUNAS) + 1):
                ws.cell(row=r, column=c).fill = SUMIU
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    return ws


def _resumo(wb, eventos_futuros, status):
    ws = wb.create_sheet("Resumo")
    ws.column_dimensions["A"].width = 28
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 60
    ws.append(["Última rodada", status["fim"][:16].replace("T", " ")])
    ws.append(["Eventos futuros na planilha", len(eventos_futuros)])
    ws.append(["Novos hoje", sum(1 for e in eventos_futuros if e.get("situacao") == "Novo hoje")])
    ws.append([])
    ws.append(["Ticketeira", "Eventos hoje", "Situação da coleta"])
    for nome, f in status["fontes"].items():
        ws.append([nome, f.get("eventos", 0), f.get("erro") or f.get("aviso") or "ok"])
    ws.append([])
    ws.append(["Cidade", "Eventos futuros"])
    por_cidade = {}
    for e in eventos_futuros:
        por_cidade[e.get("cidade") or "?"] = por_cidade.get(e.get("cidade") or "?", 0) + 1
    for cidade, n in sorted(por_cidade.items(), key=lambda t: -t[1]):
        ws.append([cidade, n])
    for row in ws.iter_rows():
        if row and row[0].value in ("Ticketeira", "Cidade"):
            for c in row:
                c.font = Font(bold=True)


def grava(caminho, historico, status, hoje):
    """Grava a planilha; se o Excel estiver com ela aberta, grava uma cópia datada."""
    hoje_iso = hoje.date().isoformat()

    def chave_data(e):
        # Evento em andamento (curso, exposição que começou antes) entra no dia de hoje.
        return (max(e.get("inicio") or "9999", hoje_iso), e["nome"].lower())

    todos = sorted(historico.values(), key=chave_data)
    # Futuro ou em andamento (festival, exposição): vale o fim, se houver.
    futuros = [e for e in todos if (e.get("fim") or e.get("inicio") or "9999")[:10] >= hoje_iso]
    novos = [e for e in futuros if e.get("situacao") == "Novo hoje"]

    wb = Workbook()
    _aba(wb, "Próximos eventos", futuros, primeira=True)
    _aba(wb, "Novos hoje", novos)
    _aba(wb, "Histórico", list(reversed(todos)))
    _resumo(wb, futuros, status)

    os.makedirs(os.path.dirname(caminho) or ".", exist_ok=True)
    tmp = caminho + ".tmp"
    wb.save(tmp)
    try:
        os.replace(tmp, caminho)
        final = caminho
    except PermissionError:
        base, ext = os.path.splitext(caminho)
        final = f"{base}_{hoje.strftime('%Y-%m-%d_%H%M')}{ext}"
        os.replace(tmp, final)

    # CSV dos próximos eventos (ponto e vírgula, abre direto no Excel em pt-BR
    # e importa no Google Planilhas).
    csv_path = os.path.splitext(caminho)[0] + ".csv"
    try:
        with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow([c for c, _ in COLUNAS[:-3]] + ["Link", "Situação"])
            for e in futuros:
                lin = _linha(e)
                for i in (0, 1):
                    lin[i] = lin[i].strftime("%d/%m/%Y") if lin[i] else ""
                w.writerow(lin[:11] + [e["link"], e.get("situacao", "")])
    except PermissionError:
        pass
    return final, len(futuros), len(novos)
