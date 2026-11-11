# Eventos Goiás

Site com os eventos que acontecem em Goiás, reunidos das ticketeiras e
atualizados sozinhos todo dia: **https://eventos-goias.pages.dev**

Projeto à parte, sem relação com nenhum outro repositório.

## Como funciona

Três vezes por dia, por volta de 07:40, 13:40 e 19:40 (horário de Goiás), o
GitHub Actions
(`.github/workflows/atualiza.yml`):

1. roda o robô (`robo_eventos.py`), que visita as ticketeiras e pega só os
   eventos de Goiás;
2. junta com o histórico (`dados/eventos.json`) e marca o que é **novo hoje** e
   o que **saiu do site** (esgotou, cancelou ou saiu da venda);
3. grava a planilha (`saida/eventos_goias.xlsx`, `.csv`) e o arquivo do site
   (`saida/eventos.json`) e faz commit disso no repositório;
4. publica o site no GitHub Pages.

Não precisa de nenhum computador ligado. Para rodar na hora: botão
**Atualizar** no topo do site (ver abaixo) ou aba **Actions** >
**Atualiza eventos** > **Run workflow**. Se a rodada falhar, o site continua
com os dados do dia anterior e avisa "atualização atrasada" no topo; o GitHub
manda um e-mail para o dono do repositório.

## O site

- **Ticketeiras**: linha sempre à vista com cada ticketeira e quantos eventos
  ela tem; clique escolhe uma ou mais (vale no computador e no celular).
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

## Endereço público e botão Atualizar

- **Endereço**: `https://eventos-goias.pages.dev` é um projeto do Cloudflare
  Pages (`endereco/`) que só repassa o site do GitHub Pages, sem mostrar o
  endereço de origem. Não precisa ser republicado quando o site muda; só se
  `endereco/public/_worker.js` mudar:
  `npx wrangler pages deploy endereco/public --project-name eventos-goias --branch main`.
- **Botão Atualizar**: o site chama `/api/estado` e `/api/atualizar`, que o
  endereço público encaminha ao Worker `eventos-goias-atualizar` (`worker/`).
  Ele guarda a permissão do GitHub (segredo `GITHUB_TOKEN`: token
  fine-grained só deste repositório, Actions: Read and write) e dispara o
  workflow no máximo uma vez a cada 30 minutos, nunca com outra coleta
  rodando (a trava vale também depois das coletas automáticas). O site
  explica isso num quadro "Como os eventos são atualizados", que sempre abre
  recolhido. Enquanto a coleta roda, o site mostra o andamento e recarrega os
  eventos sozinho no fim. Sem o segredo, o botão avisa que está indisponível e o resto funciona.
  Os horários automáticos ficam no `cron` do workflow e em `AUTOMATICAS`
  (`site/app.js`): mudar nos dois.
  - Testes: `node --test worker/test/index.test.mjs`
  - Publicar: `cd worker` e `npx wrangler deploy`
  - Trocar o token: `cd worker` e `npx wrangler secret put GITHUB_TOKEN`
- **Data e hora da coleta**: no topo de todas as abas, no Resumo, no detalhe
  de cada evento ("Conferido na ticketeira") e nos arquivos exportados
  (coluna "Conferido em"; aba "Sobre" no Excel).

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
- Ver o site localmente: `python servir.py` (abre http://localhost:8000 com os
  dados da última coleta, sem rodar o robô). O botão Atualizar ali dispara uma
  coleta de verdade.
- Dependência única do robô: `openpyxl`. No PC:
  `python -m venv .venv` e `.venv\Scripts\python -m pip install -r requirements.txt`.

## Rodar num PC (opcional)

A pasta `windows/` instala o robô no Agendador de Tarefas do Windows
(`powershell -ExecutionPolicy Bypass -File windows\instala.ps1`), para quem
quiser a planilha também numa pasta do computador ou do Google Drive
(`pasta_saida` no `config.json`). Não é necessário para o site.
