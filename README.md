# Eventos Goiás

Site com os eventos que acontecem em Goiás, reunidos das ticketeiras e
atualizados sozinhos todo dia: **https://rodrigopcviana-lab.github.io/eventos-goias/**

Projeto à parte, sem relação com nenhum outro repositório.

## Como funciona

Todo dia às 07:40 (horário de Goiás) o GitHub Actions
(`.github/workflows/atualiza.yml`):

1. roda o robô (`robo_eventos.py`), que visita as ticketeiras e pega só os
   eventos de Goiás;
2. junta com o histórico (`dados/eventos.json`) e marca o que é **novo hoje** e
   o que **saiu do site** (esgotou, cancelou ou saiu da venda);
3. grava a planilha (`saida/eventos_goias.xlsx`, `.csv`) e o arquivo do site
   (`saida/eventos.json`) e faz commit disso no repositório;
4. publica o site no GitHub Pages.

Não precisa de nenhum computador ligado. Para rodar na hora: aba **Actions** >
**Atualiza eventos** > **Run workflow**. Se a rodada falhar, o site continua
com os dados do dia anterior e avisa "atualização atrasada" no topo; o GitHub
manda um e-mail para o dono do repositório.

## O site

- **No computador**: visual de planilha (letras de coluna, número de linha,
  grade), com filtro em cada coluna como o autofiltro do Excel, busca,
  período (hoje, fim de semana, este mês, datas) e as abas Próximos eventos,
  Novos hoje, Histórico e Resumo.
- **No celular**: lista por data, filtros numa folha que sobe de baixo e
  detalhe do evento com "Ver ingressos", "Pôr na agenda", "Baixar" e
  "Compartilhar".
- **Exportar** respeita os filtros: o que está na tela, um mês inteiro ou só os
  eventos marcados, em Excel (.xlsx), CSV ou agenda (.ics). A planilha
  completa do dia fica em `/eventos_goias.xlsx`.
- O endereço guarda os filtros (`#cidade=Goiânia&p=fds`), então dá para mandar
  um link já filtrado. `#e=<id>` abre um evento.
- JavaScript puro, sem build: `site/index.html`, `site/app.js`,
  `site/app.css`. O Excel é montado no navegador pela SheetJS 0.18.5
  (Apache-2.0), servida de `site/vendor/`.

## Ticketeiras

| Site | Como |
|---|---|
| **Sympla** | busca por cidade-polo (`config.json`), descarta eventos de fora de GO |
| **Bilheteria Digital** | lista do estado + página de cada evento para a hora |
| **Outgo** | agenda do estado |
| **OTicket** | sitemap + página de cada evento; a UF fica em `dados/oticket_uf.json` para não reabrir evento de fora de GO |
| **Virtual Ticket** | API pública de leitura do próprio site |
| **Blacktag** | confere todo dia se apareceu cidade de Goiás (hoje não tem) |
| Ticket360 | sem nenhuma cidade de GO |
| Shotgun, Ingresse, BaladApp, Q2, Meu Bilhete, Ticketou | **fora**: bloqueiam acesso automático ou exigem chave da empresa |

Regra: o robô nunca contorna captcha, verificação anti-robô nem usa chave de
acesso que não foi dada a ele. Espera 1,5 s entre páginas do mesmo site.

A categoria vem do site quando ele informa; senão é deduzida pelo nome do
evento (`CATEGORIAS_PELO_NOME` em `fontes/comum.py`).

## Mexer no código

- `fontes/<site>.py`: uma função `coleta()` por ticketeira; devolve só eventos de GO.
- Fonte nova: criar o arquivo, registrar em `FONTES` no `robo_eventos.py` e no `config.json`.
- Testar uma fonte: `python robo_eventos.py --so sympla`. Teste curto: `--rapido`.
- Ver o site localmente: rodar o robô, copiar `site/` + `saida/eventos.json`,
  `saida/eventos_goias.xlsx` e `.csv` para uma pasta e servir com
  `python -m http.server`.
- Dependência única do robô: `openpyxl`.

## Rodar num PC (opcional)

A pasta `windows/` instala o robô no Agendador de Tarefas do Windows
(`powershell -ExecutionPolicy Bypass -File windows\instala.ps1`), para quem
quiser a planilha também numa pasta do computador ou do Google Drive
(`pasta_saida` no `config.json`). Não é necessário para o site.
