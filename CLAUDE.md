# Eventos Goiás

Robô que junta os eventos de Goiás das ticketeiras + site no GitHub Pages,
servido no endereço neutro https://eventos-goias.pages.dev (Cloudflare Pages,
`endereco/`). Botão Atualizar: Worker `eventos-goias-atualizar` (`worker/`).
Projeto à parte, sem relação com nenhum outro repositório. Detalhe em `README.md`.

## Regras

- **Nunca contornar bloqueio de site**: captcha, verificação anti-robô
  (Cloudflare, Vercel, queue-it) ou chave de acesso embutida no site de outra
  empresa. Site que bloqueia fica de fora e vai para a tabela do README.
- Sempre `http.get` de `fontes/comum.py` (pausa de 1,5 s por site), nunca
  pedidos em rajada.
- Evento sem dado fica vazio; nunca inventar data, hora ou local.
- `dados/` e `saida/` são commitados pelo robô do GitHub Actions todo dia:
  puxar (`git pull`) antes de mexer, e não reescrever esses arquivos à mão.
- Site sem build e sem emoji na interface; ícones são SVG de linha.
- Testar fonte nova com `python robo_eventos.py --so <fonte>` e o site no
  navegador, no computador e no celular, antes de dar push.
- Divulgar só o endereço `eventos-goias.pages.dev`: o site não pode mostrar
  nome de pessoa nem da conta do GitHub.

## Sessão local (Windows, PowerShell 5: use `;`, não `&&`)

- `git pull` antes de tudo (o robô commita `dados/` e `saida/` todo dia).
- Site no PC: `python servir.py` (porta 8000; também em `.claude/launch.json`).
- Robô: `.venv\Scripts\python robo_eventos.py --rapido` (não commitar o
  `dados/`/`saida/` de teste: `git checkout dados saida` depois).
- Worker: `node --test worker/test/index.test.mjs`; deploy com
  `npx wrangler deploy` dentro de `worker/`.
- Push em `site/**` republica o site sem coletar.
